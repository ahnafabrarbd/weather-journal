(function () {
    'use strict';

    var currentUser = null;
    var map = null;
    var markers = []; // { marker, lat, lng }
    var currentIndex = -1;

    requireAuth(function (user) {
        currentUser = user;
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        initMap();
        loadEntries();
    });

    function esc(text) {
        var d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function initMap() {
        map = L.map('map', {
            center: [23.8103, 90.4125],
            zoom: 12,
            zoomControl: false,
            attributionControl: false
        });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

        // Nav arrows
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
        m.marker.openPopup();
        updateCounter();
    }

    function updateCounter() {
        var el = document.getElementById('entry-count');
        if (markers.length > 0) {
            el.textContent = (currentIndex + 1) + ' / ' + markers.length;
        }
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

            var locStr = lat.toFixed(4) + '\u00B0, ' + lng.toFixed(4) + '\u00B0';
            if (d.location.altitude !== null && d.location.altitude !== undefined) {
                locStr += ' | ALT ' + d.location.altitude.toFixed(1) + 'M';
            }

            var content = d.content || '';
            var preview = content.length > 200 ? content.slice(0, 200) + '...' : content;

            var popup = '<div class="popup-date">' + esc(dateStr) + '</div>' +
                '<div class="popup-text">' + esc(preview) + '</div>' +
                '<div class="popup-loc">' + esc(locStr) + '</div>';

            var marker = L.circleMarker([lat, lng], {
                radius: 5,
                color: '#fff',
                fillColor: '#fff',
                fillOpacity: 0.9,
                weight: 1
            }).addTo(map).bindPopup(popup, {
                maxWidth: 250,
                minWidth: 150
            });

            markers.push({ marker: marker, lat: lat, lng: lng });
        });

        var nav = document.getElementById('map-nav');
        var countEl = document.getElementById('entry-count');

        if (markers.length > 0) {
            nav.classList.remove('hidden');
            countEl.textContent = markers.length + ' entr' + (markers.length === 1 ? 'y' : 'ies');
        } else {
            countEl.textContent = 'no entries with location data';
        }
    }
})();
