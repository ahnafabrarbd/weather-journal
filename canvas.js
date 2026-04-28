(function () {
    'use strict';

    var currentUser = null;
    var map = null;

    // markers: array of { id, lat, lng, marker, popupHtml, createdAt }
    var markers = [];
    var markerById = {};
    var currentIndex = -1;

    // connections: array of { id, fromEntryId, toEntryId, note, polyline }
    var connections = [];

    var connectMode = false;
    var pendingFromId = null;
    var pendingHighlight = null;

    var btnConnect = null;
    var banner = null;
    var filterDate = null; // YYYY-MM-DD or null

    requireAuth(function (user) {
        currentUser = user;
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initMap();
        loadEntries().then(loadConnections);
    });

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function renderAttachmentsHtml(atts) {
        if (!atts || !atts.length) return '';
        var html = '<div class="popup-attachments">';
        atts.forEach(function (att) {
            var src = att.data || att.url || '';
            if (!src) return;
            if (att.type && att.type.indexOf('image/') === 0) {
                html += '<img src="' + src + '" alt="">';
            } else if (att.type && att.type.indexOf('audio/') === 0) {
                html += '<audio controls preload="metadata" src="' + src + '"></audio>';
            }
        });
        html += '</div>';
        return html;
    }

    function setBanner(text) {
        if (!text) { banner.classList.add('hidden'); banner.textContent = ''; return; }
        banner.textContent = text;
        banner.classList.remove('hidden');
    }

    function initMap() {
        map = L.map('map', {
            center: [23.8103, 90.4125],
            zoom: 12,
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19,
            attribution: ''
        }).addTo(map);

        btnConnect = document.getElementById('btn-connect');
        banner = document.getElementById('map-banner');

        btnConnect.addEventListener('click', toggleConnectMode);

        var dateInput = document.getElementById('filter-date');
        dateInput.addEventListener('change', function () {
            filterDate = dateInput.value || null;
            applyFilter();
        });

        document.getElementById('btn-clear-date').addEventListener('click', function () {
            dateInput.value = '';
            filterDate = null;
            applyFilter();
        });

        document.getElementById('btn-connect-all').addEventListener('click', chainVisible);

        document.getElementById('btn-prev-entry').addEventListener('click', function () {
            if (!markers.length) return;
            currentIndex--;
            if (currentIndex < 0) currentIndex = markers.length - 1;
            flyTo(currentIndex);
        });

        document.getElementById('btn-next-entry').addEventListener('click', function () {
            if (!markers.length) return;
            currentIndex++;
            if (currentIndex >= markers.length) currentIndex = 0;
            flyTo(currentIndex);
        });
    }

    function flyTo(idx) {
        var m = markers[idx];
        map.flyTo([m.lat, m.lng], 16, { duration: 0.8 });
        if (!connectMode) m.marker.openPopup();
        updateCounter();
    }

    function updateCounter() {
        var el = document.getElementById('entry-count');
        if (markers.length > 0) {
            el.textContent = (currentIndex + 1) + ' / ' + markers.length;
        }
    }

    function toggleConnectMode() {
        connectMode = !connectMode;
        btnConnect.classList.toggle('on', connectMode);

        markers.forEach(function (m) {
            m.marker.closePopup();
            if (connectMode) m.marker.unbindPopup();
            else m.marker.bindPopup(m.popupHtml, { maxWidth: 250, minWidth: 150 });
        });

        clearPendingHighlight();
        pendingFromId = null;

        if (connectMode) setBanner('Connect mode — click two markers');
        else setBanner('');
    }

    function clearPendingHighlight() {
        if (pendingHighlight) {
            pendingHighlight.setStyle({ radius: 5, weight: 1, color: '#8B2252' });
            pendingHighlight = null;
        }
    }

    function highlightPending(m) {
        m.marker.setStyle({ radius: 7, weight: 2, color: '#fff' });
        pendingHighlight = m.marker;
    }

    function onMarkerClickInConnectMode(entryId) {
        if (!connectMode) return;
        var m = markerById[entryId];
        if (!m) return;

        if (!pendingFromId) {
            pendingFromId = entryId;
            highlightPending(m);
            setBanner('Click a second marker to connect');
            return;
        }

        if (pendingFromId === entryId) {
            // Same marker clicked twice — cancel selection
            clearPendingHighlight();
            pendingFromId = null;
            setBanner('Connect mode — click two markers');
            return;
        }

        var fromId = pendingFromId;
        var toId = entryId;
        clearPendingHighlight();
        pendingFromId = null;

        var note = window.prompt('Note for this connection (optional):', '') || '';
        createConnection(fromId, toId, note);
        setBanner('Connect mode — click two markers');
    }

    async function createConnection(fromEntryId, toEntryId, note) {
        var ref = await db.collection('users').doc(currentUser.uid)
            .collection('connections').add({
                fromEntryId: fromEntryId,
                toEntryId: toEntryId,
                note: note || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        renderConnection({
            id: ref.id,
            fromEntryId: fromEntryId,
            toEntryId: toEntryId,
            note: note || ''
        });
    }

    function renderConnection(conn) {
        var a = markerById[conn.fromEntryId];
        var b = markerById[conn.toEntryId];
        if (!a || !b) return;

        var line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
            color: '#8B2252',
            weight: 1.5,
            opacity: 0.7
        }).addTo(map);

        line.bindPopup(buildConnectionPopup(conn), {
            className: 'connection-popup',
            maxWidth: 240,
            minWidth: 140
        });

        line.on('popupopen', function (e) {
            var node = e.popup.getElement();
            if (!node) return;
            var editBtn = node.querySelector('[data-act="edit"]');
            var delBtn = node.querySelector('[data-act="del"]');
            if (editBtn) editBtn.addEventListener('click', function () { editConnection(conn, line); });
            if (delBtn) delBtn.addEventListener('click', function () { deleteConnection(conn, line); });
        });

        connections.push({
            id: conn.id,
            fromEntryId: conn.fromEntryId,
            toEntryId: conn.toEntryId,
            note: conn.note,
            polyline: line
        });
    }

    function buildConnectionPopup(conn) {
        var noteHtml = conn.note
            ? '<div class="popup-text">' + esc(conn.note) + '</div>'
            : '<div class="popup-loc">no note</div>';
        return noteHtml +
            '<div class="popup-actions">' +
                '<button data-act="edit">Edit</button>' +
                '<button data-act="del">Delete</button>' +
            '</div>';
    }

    async function editConnection(conn, line) {
        var entry = connections.find(function (c) { return c.id === conn.id; });
        var current = entry ? entry.note : conn.note;
        var next = window.prompt('Edit note:', current || '');
        if (next === null) return;
        await db.collection('users').doc(currentUser.uid)
            .collection('connections').doc(conn.id).update({ note: next });
        if (entry) entry.note = next;
        conn.note = next;
        line.setPopupContent(buildConnectionPopup(conn));
    }

    async function deleteConnection(conn, line) {
        if (!window.confirm('Delete this connection?')) return;
        await db.collection('users').doc(currentUser.uid)
            .collection('connections').doc(conn.id).delete();
        map.removeLayer(line);
        connections = connections.filter(function (c) { return c.id !== conn.id; });
    }

    function attachMarkerClick(marker, entryId) {
        marker.on('click', function () { onMarkerClickInConnectMode(entryId); });
    }

    async function loadEntries() {
        var snap = await db.collection('users').doc(currentUser.uid)
            .collection('entries').orderBy('createdAt', 'desc').get();

        snap.forEach(function (doc) {
            var d = doc.data();
            if (!d.location || d.location.latitude === null) return;

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

            var popup = '<div class="popup-date">' + esc(dateStr) + '</div>';
            if (preview) popup += '<div class="popup-text">' + esc(preview) + '</div>';
            popup += renderAttachmentsHtml(d.attachments);
            popup += '<div class="popup-loc">' + esc(locStr) + '</div>';

            var marker = L.circleMarker([lat, lng], {
                radius: 5,
                color: '#8B2252',
                fillColor: '#8B2252',
                fillOpacity: 0.9,
                weight: 1
            }).addTo(map).bindPopup(popup, {
                maxWidth: 250,
                minWidth: 150
            });

            attachMarkerClick(marker, doc.id);

            var record = {
                id: doc.id,
                lat: lat,
                lng: lng,
                marker: marker,
                popupHtml: popup,
                createdAt: d.createdAt ? d.createdAt.toDate() : null
            };
            markers.push(record);
            markerById[doc.id] = record;
        });

        var countEl = document.getElementById('entry-count');

        if (markers.length > 0) {
            countEl.textContent = markers.length + ' entr' + (markers.length === 1 ? 'y' : 'ies');
            currentIndex = 0;
            flyTo(0);
        } else {
            countEl.textContent = 'no entries with location — allow location access when posting';
        }
    }

    async function loadConnections() {
        var snap = await db.collection('users').doc(currentUser.uid)
            .collection('connections').get();
        snap.forEach(function (doc) {
            var d = doc.data();
            renderConnection({
                id: doc.id,
                fromEntryId: d.fromEntryId,
                toEntryId: d.toEntryId,
                note: d.note || ''
            });
        });
        applyFilter();
    }

    function localDateKey(d) {
        if (!d) return null;
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function markerMatchesFilter(m) {
        if (!filterDate) return true;
        return localDateKey(m.createdAt) === filterDate;
    }

    function applyFilter() {
        var visibleIds = {};
        markers.forEach(function (m) {
            var visible = markerMatchesFilter(m);
            if (visible) {
                if (!map.hasLayer(m.marker)) m.marker.addTo(map);
                visibleIds[m.id] = true;
            } else {
                if (map.hasLayer(m.marker)) map.removeLayer(m.marker);
            }
        });

        connections.forEach(function (c) {
            var bothVisible = visibleIds[c.fromEntryId] && visibleIds[c.toEntryId];
            if (bothVisible) {
                if (!map.hasLayer(c.polyline)) c.polyline.addTo(map);
            } else {
                if (map.hasLayer(c.polyline)) map.removeLayer(c.polyline);
            }
        });

        var visibleCount = Object.keys(visibleIds).length;
        var countEl = document.getElementById('entry-count');
        if (filterDate) {
            countEl.textContent = visibleCount + ' on ' + filterDate;
        } else if (markers.length > 0) {
            countEl.textContent = markers.length + ' entr' + (markers.length === 1 ? 'y' : 'ies');
        }
    }

    async function chainVisible() {
        var visible = markers
            .filter(markerMatchesFilter)
            .filter(function (m) { return m.createdAt; })
            .slice()
            .sort(function (a, b) { return a.createdAt - b.createdAt; });

        if (visible.length < 2) {
            alert('Need at least two visible entries with timestamps to chain.');
            return;
        }

        if (!window.confirm('Chain ' + visible.length + ' entries with ' + (visible.length - 1) + ' connections?')) return;

        for (var i = 0; i < visible.length - 1; i++) {
            await createConnection(visible[i].id, visible[i + 1].id, '');
        }
        applyFilter();
    }
})();
