(function () {
    'use strict';

    var currentUser = null;
    var app = document.getElementById('app');
    var loadingEl = document.getElementById('loading');
    var list = document.getElementById('history-list');

    requireAuth(function (user) {
        currentUser = user;
        loadingEl.classList.add('hidden');
        app.classList.remove('hidden');
        loadEntries();
    });

    document.getElementById('btn-logout').addEventListener('click', function (e) {
        e.preventDefault();
        doSignOut();
    });

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    async function loadEntries() {
        list.innerHTML = '<div class="empty-state">Loading...</div>';

        var snap = await db.collection('users').doc(currentUser.uid)
            .collection('entries').orderBy('createdAt', 'desc').get();

        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<div class="empty-state">No entries yet</div>';
            return;
        }

        snap.forEach(function (doc) {
            var d = doc.data();
            var item = document.createElement('div');
            item.className = 'entry-item';

            // Date
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

            // Location
            var locStr = '';
            if (d.location && d.location.latitude !== null) {
                locStr = d.location.latitude.toFixed(4) + '\u00B0, ' + d.location.longitude.toFixed(4) + '\u00B0';
                if (d.location.altitude !== null) locStr += ' | ALT ' + d.location.altitude.toFixed(1) + 'M';
            }

            var html = '<div class="entry-meta">';
            html += '<span>' + esc(dateStr) + '</span>';
            if (locStr) html += '<span>' + esc(locStr) + '</span>';
            html += '</div>';
            html += '<div class="entry-content">' + esc(d.content || '') + '</div>';

            if (d.attachments && d.attachments.length) {
                html += '<div class="entry-attachments-count">' + d.attachments.length + ' attachment(s)</div>';
                html += '<div class="entry-attachments-full">';
                d.attachments.forEach(function (att) {
                    if (att.type && att.type.startsWith('image/')) {
                        html += '<img src="' + esc(att.url) + '" alt="' + esc(att.name) + '" loading="lazy">';
                    } else if (att.type && att.type.startsWith('audio/')) {
                        html += '<audio controls src="' + esc(att.url) + '"></audio>';
                    } else {
                        html += '<a href="' + esc(att.url) + '" target="_blank" rel="noopener">' + esc(att.name) + '</a>';
                    }
                });
                html += '</div>';
            }

            html += '<div class="entry-actions">';
            html += '<button class="btn" data-del="' + doc.id + '">DELETE</button>';
            html += '</div>';

            item.innerHTML = html;

            // Expand/collapse
            item.addEventListener('click', function (e) {
                if (e.target.closest('[data-del]')) return;
                item.classList.toggle('entry-expanded');
            });

            // Delete
            var delBtn = item.querySelector('[data-del]');
            if (delBtn) {
                delBtn.addEventListener('click', async function (e) {
                    e.stopPropagation();
                    if (!confirm('Delete this entry?')) return;

                    // Delete attachments from storage
                    if (d.attachments) {
                        for (var i = 0; i < d.attachments.length; i++) {
                            try { await storage.ref(d.attachments[i].path).delete(); } catch (err) { /* ignore */ }
                        }
                    }

                    await db.collection('users').doc(currentUser.uid)
                        .collection('entries').doc(doc.id).delete();
                    item.remove();

                    if (!list.children.length) {
                        list.innerHTML = '<div class="empty-state">No entries yet</div>';
                    }
                });
            }

            list.appendChild(item);
        });
    }
})();
