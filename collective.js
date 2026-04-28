(function () {
    'use strict';

    var currentUser = null;
    var app = document.getElementById('app');
    var loadingEl = document.getElementById('loading');
    var list = document.getElementById('collective-list');

    requireAuth(function (user) {
        currentUser = user;
        loadingEl.classList.add('hidden');
        app.classList.remove('hidden');
        loadPublicEntries();
    });

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    async function loadPublicEntries() {
        list.innerHTML = '<div class="empty-state">Loading...</div>';

        var snap = await db.collection('public_entries')
            .orderBy('createdAt', 'desc').get();

        list.innerHTML = '';

        if (snap.empty) {
            list.innerHTML = '<div class="empty-state">No public entries yet</div>';
            return;
        }

        snap.forEach(function (doc) {
            var d = doc.data();
            var entry = document.createElement('div');
            entry.className = 'collective-entry';

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

            // Author
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

            // Comments section
            var commentsSection = document.createElement('div');
            commentsSection.className = 'comments-section';

            var commentsContainer = document.createElement('div');
            commentsSection.appendChild(commentsContainer);

            // Comment form
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

            // Load comments
            loadComments(doc.id, commentsContainer);

            // Post comment
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
