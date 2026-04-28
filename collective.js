(function () {
    'use strict';

    var currentUser = null;
    var app = document.getElementById('app');
    var loadingEl = document.getElementById('loading');
    var list = document.getElementById('collective-list');
    var tabTime = document.getElementById('tab-time');
    var tabSpace = document.getElementById('tab-space');
    var panelTime = document.getElementById('panel-time');
    var panelSpace = document.getElementById('panel-space');

    var entriesCache = [];
    var spaceMap = null;
    var spaceMarkers = [];

    requireAuth(function (user) {
        currentUser = user;
        loadingEl.classList.add('hidden');
        app.classList.remove('hidden');
        wireTabs();
        loadPublicEntries();
    });

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function wireTabs() {
        tabTime.addEventListener('click', function () { showTab('time'); });
        tabSpace.addEventListener('click', function () { showTab('space'); });
    }

    function showTab(name) {
        var isTime = name === 'time';
        tabTime.classList.toggle('active', isTime);
        tabSpace.classList.toggle('active', !isTime);
        panelTime.classList.toggle('active', isTime);
        panelSpace.classList.toggle('active', !isTime);

        if (!isTime) {
            if (!spaceMap) initSpaceMap();
            else spaceMap.invalidateSize();
            renderSpaceMarkers();
        }
    }

    function initSpaceMap() {
        spaceMap = L.map('collective-map', {
            center: [23.8103, 90.4125],
            zoom: 3,
            zoomControl: false,
            attributionControl: false
        });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(spaceMap);
    }

    function renderSpaceMarkers() {
        spaceMarkers.forEach(function (m) { spaceMap.removeLayer(m); });
        spaceMarkers = [];

        var bounds = [];
        entriesCache.forEach(function (d) {
            if (!d.location || d.location.latitude === null || d.location.latitude === undefined) return;

            var lat = d.location.latitude;
            var lng = d.location.longitude;

            var dateStr = '';
            if (d.createdAt) {
                var dt = d.createdAt.toDate();
                dateStr = dt.toLocaleString('en-GB', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
            }

            var locStr = lat.toFixed(4) + '°, ' + lng.toFixed(4) + '°';
            if (d.location.altitude !== null && d.location.altitude !== undefined) {
                locStr += ' | ALT ' + d.location.altitude.toFixed(1) + 'M';
            }

            var content = d.content || '';
            var preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
            var author = d.authorEmail || 'anonymous';

            var popup = '<div class="popup-author">' + esc(author) + '</div>' +
                '<div class="popup-date">' + esc(dateStr) + '</div>' +
                '<div class="popup-text">' + esc(preview) + '</div>' +
                '<div class="popup-loc">' + esc(locStr) + '</div>';

            var marker = L.circleMarker([lat, lng], {
                radius: 5,
                color: '#8B2252',
                fillColor: '#8B2252',
                fillOpacity: 0.9,
                weight: 1
            }).addTo(spaceMap).bindPopup(popup, { maxWidth: 250, minWidth: 150 });

            spaceMarkers.push(marker);
            bounds.push([lat, lng]);
        });

        if (bounds.length) spaceMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    async function loadPublicEntries() {
        list.innerHTML = '<div class="empty-state">Loading...</div>';

        var snap = await db.collection('public_entries')
            .orderBy('createdAt', 'desc').get();

        list.innerHTML = '';
        entriesCache = [];

        if (snap.empty) {
            list.innerHTML = '<div class="empty-state">No public entries yet</div>';
            return;
        }

        snap.forEach(function (doc) {
            var d = doc.data();
            entriesCache.push(d);

            var entry = document.createElement('div');
            entry.className = 'collective-entry';

            var dateStr = '';
            if (d.createdAt) {
                var dt = d.createdAt.toDate();
                dateStr = dt.toLocaleString('en-GB', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
            } else if (d.clientTimestamp) {
                dateStr = new Date(d.clientTimestamp).toLocaleString();
            }

            var locStr = '';
            if (d.location && d.location.latitude !== null) {
                locStr = d.location.latitude.toFixed(4) + '°, ' + d.location.longitude.toFixed(4) + '°';
                if (d.location.altitude !== null) locStr += ' | ALT ' + d.location.altitude.toFixed(1) + 'M';
            }

            var authorStr = d.authorEmail || 'anonymous';

            var html = '<div class="entry-author">' + esc(authorStr) + '</div>';
            html += '<div class="entry-meta">';
            html += '<span>' + esc(dateStr) + '</span>';
            if (locStr) html += '<span>' + esc(locStr) + '</span>';
            html += '</div>';
            html += '<div class="entry-content">' + esc(d.content || '') + '</div>';

            if (d.attachments && d.attachments.length) {
                html += '<div class="entry-attachments-full" style="display:flex">';
                d.attachments.forEach(function (att) {
                    var src = att.data || att.url || '';
                    if (att.type && att.type.startsWith('image/')) {
                        html += '<img src="' + src + '" alt="' + esc(att.name) + '" loading="lazy">';
                    } else if (att.type && att.type.startsWith('audio/')) {
                        html += '<audio controls src="' + src + '"></audio>';
                    }
                });
                html += '</div>';
            }

            entry.innerHTML = html;

            var commentsSection = document.createElement('div');
            commentsSection.className = 'comments-section';

            var commentsContainer = document.createElement('div');
            commentsSection.appendChild(commentsContainer);

            var form = document.createElement('div');
            form.className = 'comment-form';
            var input = document.createElement('input');
            input.className = 'comment-input';
            input.placeholder = 'Leave a comment...';
            var btn = document.createElement('button');
            btn.className = 'comment-btn';
            btn.textContent = 'Post';
            form.appendChild(input);
            form.appendChild(btn);
            commentsSection.appendChild(form);

            entry.appendChild(commentsSection);

            loadComments(doc.id, commentsContainer);

            btn.addEventListener('click', function () {
                postComment(doc.id, input, commentsContainer);
            });
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') postComment(doc.id, input, commentsContainer);
            });

            list.appendChild(entry);
        });
    }

    async function loadComments(entryId, container) {
        var snap = await db.collection('public_entries').doc(entryId)
            .collection('comments').orderBy('createdAt', 'asc').get();

        container.innerHTML = '';
        snap.forEach(function (doc) {
            var c = doc.data();
            var item = document.createElement('div');
            item.className = 'comment-item';

            var dateStr = '';
            if (c.createdAt) {
                dateStr = c.createdAt.toDate().toLocaleString('en-GB', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
                });
            }

            item.innerHTML = '<div class="comment-meta">' + esc(c.authorEmail || 'anonymous') +
                ' &middot; ' + esc(dateStr) + '</div>' +
                '<div>' + esc(c.text) + '</div>';
            container.appendChild(item);
        });
    }

    async function postComment(entryId, input, container) {
        var text = input.value.trim();
        if (!text) return;

        input.value = '';

        await db.collection('public_entries').doc(entryId)
            .collection('comments').add({
                text: text,
                authorId: currentUser.uid,
                authorEmail: currentUser.email || 'anonymous',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        loadComments(entryId, container);
    }
})();
