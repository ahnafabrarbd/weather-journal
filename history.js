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

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    async function togglePublic(docId, data, isPublic, toggleBox) {
        // Update user's own entry
        await db.collection('users').doc(currentUser.uid)
            .collection('entries').doc(docId).update({ public: isPublic });

        if (isPublic) {
            // Copy to public_entries
            await db.collection('public_entries').doc(docId).set({
                content: data.content || '',
                location: data.location || {},
                attachments: data.attachments || [],
                createdAt: data.createdAt || null,
                clientTimestamp: data.clientTimestamp || '',
                authorId: currentUser.uid,
                authorEmail: currentUser.email || 'anonymous',
                public: true
            });
        } else {
            // Remove from public_entries
            await db.collection('public_entries').doc(docId).delete();
        }

        toggleBox.classList.toggle('on', isPublic);
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

            var html = '';
            if (d.importedFromEmail) {
                html += '<div class="entry-imported-tag">collected from ' + esc(d.importedFromEmail) + '</div>';
            }
            html += '<div class="entry-meta">';
            html += '<span>' + esc(dateStr) + '</span>';
            if (locStr) html += '<span>' + esc(locStr) + '</span>';
            html += '</div>';
            html += '<div class="entry-content">' + esc(d.content || '') + '</div>';

            if (d.attachments && d.attachments.length) {
                html += '<div class="entry-attachments-count">' + d.attachments.length + ' attachment(s)</div>';
                html += '<div class="entry-attachments-full">';
                d.attachments.forEach(function (att) {
                    var src = att.data || att.url || '';
                    if (att.type && att.type.startsWith('image/')) {
                        html += '<img src="' + src + '" alt="' + esc(att.name) + '" loading="lazy">';
                    } else if (att.type && att.type.startsWith('audio/')) {
                        html += '<audio controls src="' + src + '"></audio>';
                    } else if (src.startsWith('data:')) {
                        html += '<a href="' + src + '" download="' + esc(att.name) + '">' + esc(att.name) + '</a>';
                    } else {
                        html += '<span>' + esc(att.name) + '</span>';
                    }
                });
                html += '</div>';
            }

            html += '<div class="entry-actions">';
            html += '<button class="btn" data-del="' + doc.id + '">DELETE</button>';
            html += '</div>';

            item.innerHTML = html;

            // Public toggle (hidden for imported entries — those are someone else's words)
            if (!d.importedFromEmail) {
                var toggle = document.createElement('div');
                toggle.className = 'public-toggle';
                var box = document.createElement('span');
                box.className = 'toggle-box' + (d.public ? ' on' : '');
                toggle.appendChild(box);
                var label = document.createElement('span');
                label.textContent = 'Public';
                toggle.appendChild(label);

                toggle.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var newState = !box.classList.contains('on');
                    togglePublic(doc.id, d, newState, box);
                });

                item.appendChild(toggle);
            }

            // Expand/collapse
            item.addEventListener('click', function (e) {
                if (e.target.closest('[data-del]') || e.target.closest('.public-toggle')) return;
                item.classList.toggle('entry-expanded');
            });

            // Delete
            var delBtn = item.querySelector('[data-del]');
            if (delBtn) {
                delBtn.addEventListener('click', async function (e) {
                    e.stopPropagation();
                    if (!confirm('Delete this entry?')) return;

                    // Also remove from public if it was public
                    if (d.public) {
                        try { await db.collection('public_entries').doc(doc.id).delete(); } catch(err) {}
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
