/* Live player: canvas animation synced to the Web Audio clock. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const seek = $('seek'), time = $('time'), big = $('big'), playBtn = $('play');

  let ac = null, bus = null, startAt = 0, playing = false, cur = 27.9, ready = false;

  function fit() {
    const w = Math.min(1920, Math.round(cv.clientWidth * (window.devicePixelRatio || 1)));
    if (cv.width !== w) { cv.width = w; cv.height = Math.round((w * 9) / 16); }
  }

  function stopAudio() {
    if (ac) { ac.close(); ac = null; bus = null; }
  }

  function startAudio(from) {
    stopAudio();
    ac = new (window.AudioContext || window.webkitAudioContext)();
    bus = ac.createGain();
    bus.gain.value = $('mute').checked ? 0 : 1;
    bus.connect(ac.destination);
    startAt = ac.currentTime + 0.1 - from;
    AD.buildAudio(ac, { startAt, from, destination: bus });
  }

  function play() {
    if (!ready) return;
    if (cur >= AD.DUR - 0.05) cur = 0;
    startAudio(cur);
    playing = true;
    big.hidden = true;
    playBtn.textContent = '❚❚ השהה';
  }

  function pause() {
    if (playing && ac) cur = ac.currentTime - startAt;
    stopAudio();
    playing = false;
    playBtn.textContent = '▶ נגן';
  }

  function frame() {
    fit();
    if (playing && ac) {
      cur = Math.max(0, ac.currentTime - startAt);
      if (cur >= AD.DUR) { cur = AD.DUR; pause(); big.hidden = false; }
    }
    if (ready) AD.render(ctx, Math.min(cur, AD.DUR - 1e-3), cv.width / AD.W, { subtitles: $('caps').checked });
    seek.value = cur;
    time.textContent = `${cur.toFixed(2)} / ${AD.DUR.toFixed(2)}`;
    requestAnimationFrame(frame);
  }

  playBtn.onclick = () => (playing ? pause() : play());
  big.onclick = () => { cur = 0; play(); };
  $('restart').onclick = () => { cur = 0; play(); };
  seek.oninput = () => { const was = playing; pause(); cur = Number(seek.value); if (was) play(); };
  $('mute').onchange = () => { if (bus) bus.gain.value = $('mute').checked ? 0 : 1; };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); playing ? pause() : play(); }
  });

  AD.loadAssets('').then(() => { ready = true; }).catch(() => { ready = true; });
  requestAnimationFrame(frame);
})();
