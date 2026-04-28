(function () {
    'use strict';

    var currentUser = null;
    var attachments = [];
    var mediaRecorder = null;
    var recChunks = [];
    var recTimer = null;
    var recSeconds = 0;
    var location = { latitude: null, longitude: null, altitude: null };

    var app = document.getElementById('app');
    var loadingEl = document.getElementById('loading');
    var metaTime = document.getElementById('meta-time');
    var metaLoc = document.getElementById('meta-location');
    var entryText = document.getElementById('entry-text');
    var preview = document.getElementById('preview');
    var inputPhoto = document.getElementById('input-photo');
    var inputGallery = document.getElementById('input-gallery');
    var inputFile = document.getElementById('input-file');
    var btnRecord = document.getElementById('btn-record');
    var btnStop = document.getElementById('btn-stop');
    var recIndicator = document.getElementById('rec-indicator');
    var recTime = document.getElementById('rec-time');
    var btnPost = document.getElementById('btn-post');
    var dropOverlay = document.getElementById('drop-overlay');

    requireAuth(function (user) {
        currentUser = user;
        loadingEl.classList.add('hidden');
        app.classList.remove('hidden');
        start();
    });

    document.getElementById('btn-logout').addEventListener('click', function (e) {
        e.preventDefault();
        doSignOut();
    });

    function start() {
        updateTime();
        setInterval(updateTime, 1000);
        fetchLocation();

        inputPhoto.addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
        inputGallery.addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
        inputFile.addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
        btnRecord.addEventListener('click', startRec);
        btnStop.addEventListener('click', stopRec);
        btnPost.addEventListener('click', post);

        // Drag & drop
        var dragCount = 0;
        document.addEventListener('dragenter', function (e) {
            e.preventDefault(); dragCount++;
            dropOverlay.classList.add('active');
        });
        document.addEventListener('dragleave', function (e) {
            e.preventDefault(); dragCount--;
            if (dragCount <= 0) { dragCount = 0; dropOverlay.classList.remove('active'); }
        });
        document.addEventListener('dragover', function (e) { e.preventDefault(); });
        document.addEventListener('drop', function (e) {
            e.preventDefault(); dragCount = 0;
            dropOverlay.classList.remove('active');
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        });

        // Paste
        document.addEventListener('paste', function (e) {
            var files = [];
            for (var i = 0; i < e.clipboardData.items.length; i++) {
                if (e.clipboardData.items[i].kind === 'file') {
                    files.push(e.clipboardData.items[i].getAsFile());
                }
            }
            if (files.length) addFiles(files);
        });

        entryText.focus();
    }

    function updateTime() {
        var now = new Date();
        metaTime.textContent = now.toLocaleString('en-GB', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
    }

    async function fetchLocation() {
        metaLoc.textContent = 'LOCATING...';
        location = await getLocation();
        if (location.latitude !== null) {
            var s = location.latitude.toFixed(4) + '\u00B0, ' + location.longitude.toFixed(4) + '\u00B0';
            if (location.altitude !== null) s += ' | ALT ' + location.altitude.toFixed(1) + 'M';
            metaLoc.textContent = s;
        } else {
            metaLoc.textContent = 'LOCATION UNAVAILABLE';
        }
    }

    function addFiles(fileList) {
        for (var i = 0; i < fileList.length; i++) {
            var file = fileList[i];
            var entry = { file: file, preview: null };
            if (file.type.startsWith('image/')) {
                (function (ent) {
                    var reader = new FileReader();
                    reader.onload = function (e) { ent.preview = e.target.result; renderPreview(); };
                    reader.readAsDataURL(file);
                })(entry);
            }
            attachments.push(entry);
        }
        renderPreview();
    }

    function renderPreview() {
        preview.innerHTML = '';
        attachments.forEach(function (att, i) {
            var thumb = document.createElement('div');
            thumb.className = 'attachment-thumb';

            if (att.preview) {
                var img = document.createElement('img');
                img.src = att.preview;
                thumb.appendChild(img);
            } else {
                var icon = document.createElement('div');
                icon.className = 'file-icon';
                icon.textContent = att.file.name.slice(0, 10);
                thumb.appendChild(icon);
            }

            var rm = document.createElement('div');
            rm.className = 'remove';
            rm.textContent = '\u00D7';
            rm.addEventListener('click', (function (idx) {
                return function () { attachments.splice(idx, 1); renderPreview(); };
            })(i));
            thumb.appendChild(rm);
            preview.appendChild(thumb);
        });
    }

    async function startRec() {
        try {
            var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            recChunks = [];

            mediaRecorder.ondataavailable = function (e) { recChunks.push(e.data); };
            mediaRecorder.onstop = function () {
                var blob = new Blob(recChunks, { type: 'audio/webm' });
                var file = new File([blob], 'recording_' + Date.now() + '.webm', { type: 'audio/webm' });
                addFiles([file]);
                stream.getTracks().forEach(function (t) { t.stop(); });
            };

            mediaRecorder.start();
            btnRecord.classList.add('hidden');
            recIndicator.classList.remove('hidden');
            recSeconds = 0;
            recTimer = setInterval(function () {
                recSeconds++;
                var m = String(Math.floor(recSeconds / 60)).padStart(2, '0');
                var s = String(recSeconds % 60).padStart(2, '0');
                recTime.textContent = m + ':' + s;
            }, 1000);
        } catch (err) {
            alert('Microphone access denied.');
        }
    }

    function stopRec() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        clearInterval(recTimer);
        btnRecord.classList.remove('hidden');
        recIndicator.classList.add('hidden');
    }

    async function post() {
        var text = entryText.value.trim();
        if (!text && !attachments.length) return;

        btnPost.disabled = true;
        btnPost.textContent = 'POSTING...';

        try {
            var uploaded = [];
            for (var i = 0; i < attachments.length; i++) {
                uploaded.push(await uploadFile(currentUser.uid, attachments[i].file));
            }

            await db.collection('users').doc(currentUser.uid)
                .collection('entries').add({
                    content: text,
                    location: location,
                    attachments: uploaded,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    clientTimestamp: new Date().toISOString(),
                });

            entryText.value = '';
            attachments = [];
            renderPreview();
            entryText.focus();
            fetchLocation();
        } catch (err) {
            console.error(err);
            alert('Failed to post: ' + err.message);
        }

        btnPost.disabled = false;
        btnPost.textContent = 'POST';
    }
})();
