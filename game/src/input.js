// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only: the game asks the canvas for pointer lock and reads movementX/Y
// while it holds it. Right mouse aims; pressed edges are consumed once per frame
// by main.js through takePressed, so B/G/E fire once per key press.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); pressed.clear(); state.firing = false; state.aiming = false; });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { state.firing = false; state.aiming = false; }
    if (onLockChange) onLockChange(state.locked);
  });

  function requestLock() {
    canvas.requestPointerLock();
  }
  function takeLook() {
    const look = { x: state.lookX, y: state.lookY };
    state.lookX = 0;
    state.lookY = 0;
    return look;
  }
  function takePressed(code) {
    if (pressed.has(code)) {
      pressed.delete(code);
      return true;
    }
    return false;
  }
  function endFrame() {
    pressed.clear();
  }

  return { state, requestLock, takeLook, takePressed, endFrame };
}
