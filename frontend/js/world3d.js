/* Ward Life GH: 3D hospital view (three.js r149).
   Low-poly on purpose so it runs smoothly on mid-range phones.
   app.js calls World3D.init() once and World3D.update() on every server tick. */
(() => {
  'use strict';
  if (!window.THREE) return;
  const T = window.THREE;

  // ---------- layout (same as the floor plan) ----------
  const W = 10, D = 8, G = 3.2, WALL_H = 1.7, WALL_T = 0.25, DOOR = 2.4;
  const colX = (c) => (c - 1.5) * (W + G);
  const rowZ = (r) => r * (D + G);
  const GRID = { ambulance: [0, 0], emergency: [1, 0], radiology: [2, 0], lab: [3, 0], records: [0, 1], opd: [1, 1],
    pharmacy: [2, 1], theatre: [3, 1], maternity: [0, 2], paeds: [1, 2], medical: [2, 2], surgical: [3, 2] };
  const RECT = {};
  Object.entries(GRID).forEach(([id, [c, r]]) => { RECT[id] = { x: colX(c), z: rowZ(r), w: W, d: D }; });
  RECT.conference = { x: 0, z: rowZ(2) + D / 2 + G + 3.2, w: 4 * W + 3 * G, d: 6.4 };
  const ROAD_Z = rowZ(0) - D / 2 - G - 3;
  const GAPS = [0, 1, 2].map((c) => colX(c) + W / 2 + G / 2);
  const BEDS = { emergency: 6, opd: 4, maternity: 6, paeds: 6, medical: 8, surgical: 8, theatre: 1 };
  const FLOOR = { ambulance: 0x8A949C, emergency: 0xE9F1F2, radiology: 0xE4E8F0, lab: 0xEEF2F0, records: 0xEFE8DA, opd: 0xE7EEF1,
    pharmacy: 0xE9F2E6, theatre: 0xCFE7DD, maternity: 0xF4E4EA, paeds: 0xF6EDCF, medical: 0xEFEBE2, surgical: 0xE8ECE6, conference: 0xC9A47A };
  const ROLE_COL = { doctor: 0x1E5AA8, student: 0x5B6CF0, nurse: 0x0E7C7B, midwife: 0x8E44AD, pharmacist: 0x2E7D32,
    lab_scientist: 0xB4532A, radiographer: 0x4F5D75, paramedic: 0xA4161A };
  const TRI = { red: 0xD7263D, orange: 0xEE7B06, yellow: 0xE9B824, green: 0x2E9E5B };
  const SKIN = [0x5A3825, 0x6B4423, 0x4A2C1D, 0x7A4E2D, 0x3D2416];
  const HIDDEN = ['en_route', 'awaiting_ambulance', 'pickup', 'leaving'];

  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rnd = (seed, i) => ((hash(`${seed}:${i}`) % 1000) / 1000);

  // ---------- shared materials and geometry ----------
  const mats = {};
  const mat = (color, extra = {}) => {
    const key = `${color}-${JSON.stringify(extra)}`;
    return mats[key] || (mats[key] = new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...extra }));
  };
  const GEO = {
    box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(0.5, 0.5, 1, 14), sph: new T.SphereGeometry(0.5, 16, 12),
    cone: new T.ConeGeometry(0.5, 1, 10), wheel: new T.CylinderGeometry(0.42, 0.42, 0.3, 14),
  };
  function mesh(geo, material, sx, sy, sz, x = 0, y = 0, z = 0, shadow = true) {
    const m = new T.Mesh(GEO[geo] || geo, material);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    return m;
  }

  function textSprite(text, opts = {}) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: opts.depthTest ?? true, transparent: true }));
    sp.userData = { canvas: c, tex, text: null, opts };
    setSpriteText(sp, text);
    sp.scale.set(opts.w || 6, (opts.w || 6) / 4, 1);
    sp.renderOrder = 10;
    return sp;
  }
  function setSpriteText(sp, text) {
    if (sp.userData.text === text) return;
    sp.userData.text = text;
    const { canvas: c, tex, opts } = sp.userData; const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = `${opts.weight || 700} ${opts.size || 46}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;
    const lines = String(text).split('\n');
    const w = Math.min(c.width - 8, Math.max(...lines.map((l) => g.measureText(l).width)) + 44);
    const h = lines.length > 1 ? 118 : 74; const x = (c.width - w) / 2; const y = (c.height - h) / 2;
    g.fillStyle = opts.bg || 'rgba(20,35,58,.86)';
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 22) : g.rect(x, y, w, h); g.fill();
    g.fillStyle = opts.fg || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      if (i === 1) { g.font = `500 ${Math.round((opts.size || 46) * 0.72)}px -apple-system, "Helvetica Neue", Arial, sans-serif`; g.fillStyle = opts.fg2 || '#CFE3E2'; }
      g.fillText(l, c.width / 2, lines.length > 1 ? c.height / 2 + (i === 0 ? -20 : 26) : c.height / 2);
    });
    tex.needsUpdate = true;
  }

  // ---------- state ----------
  let renderer, scene, camera, container, sun, hemi, raycaster, onRoom;
  let visible = true; let running = false; let lastT = 0;
  const floors = []; const roomLabels = {}; const roomFloors = {};
  const slots = {};          // dept -> [{x, z, blanket, head, body, pid}]
  const standers = {};       // dept -> pool of standing patient figures
  const avatars = new Map(); // uid -> avatar
  const ambs = new Map();    // key -> ambulance
  const lamps = [];
  let meRing, eventMarker, me = null, myDept = null, lastState = null;
  const cam = { yaw: 0.55, pitch: 0.92, dist: 68, target: new T.Vector3(0, 0, rowZ(1) + 3), follow: false };

  // ---------- building the world ----------
  function buildWorld() {
    scene.add(mesh('box', mat(0x7FA35B), 260, 0.2, 220, 0, -0.12, 10, false));                         // grass
    scene.add(mesh('box', mat(0xC9D3D6), 4 * W + 3 * G + 6, 0.1, RECT.conference.z + 6 - ROAD_Z + 2, 0, -0.02,
      (ROAD_Z + 3 + RECT.conference.z + RECT.conference.d / 2 + 2) / 2, false));                       // hospital slab
    // road with dashes and kerbs
    scene.add(mesh('box', mat(0x3B4652), 260, 0.06, 6, 0, 0.02, ROAD_Z, false));
    for (let x = -120; x < 120; x += 6) scene.add(mesh('box', mat(0xE9D27A), 2.6, 0.02, 0.22, x, 0.07, ROAD_Z, false));
    [ROAD_Z - 3.1, ROAD_Z + 3.1].forEach((z) => scene.add(mesh('box', mat(0xD9DDE0), 260, 0.2, 0.25, 0, 0.1, z)));

    Object.keys(RECT).forEach(buildRoom);
    buildSign(); buildTrees(); buildCarPark(); buildLamps();

    meRing = new T.Mesh(new T.TorusGeometry(0.75, 0.09, 8, 28), mat(0x0E7C7B, { emissive: 0x0E7C7B, emissiveIntensity: 0.8 }));
    meRing.rotation.x = Math.PI / 2; meRing.visible = false; meRing.userData.dyn = true; scene.add(meRing);
    eventMarker = new T.Group();
    const cone = mesh('cone', mat(0xE9B824, { emissive: 0xE9B824, emissiveIntensity: 0.5 }), 1.1, 1.4, 1.1, 0, 0, 0);
    cone.rotation.x = Math.PI; eventMarker.add(cone); eventMarker.visible = false; eventMarker.userData.dyn = true; scene.add(eventMarker);
    mergeStatic();
  }

  // Merge every fixed object that shares a material into one mesh: far fewer draw calls on phones.
  function mergeStatic() {
    scene.updateMatrixWorld(true);
    const groups = new Map(); const remove = [];
    scene.traverse((o) => {
      if (!o.isMesh || o.userData.dyn) return;
      for (let p = o.parent; p; p = p.parent) if (p.userData && p.userData.dyn) return;
      const k = o.material.uuid;
      if (!groups.has(k)) groups.set(k, { material: o.material, list: [], cast: false });
      const g = groups.get(k); g.list.push(o); g.cast = g.cast || o.castShadow; remove.push(o);
    });
    remove.forEach((o) => o.parent.remove(o));
    const nm = new T.Matrix3(); const v = new T.Vector3();
    groups.forEach(({ material, list, cast }) => {
      let nv = 0; let ni = 0;
      list.forEach((m) => { const g = m.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
      const pos = new Float32Array(nv * 3); const nor = new Float32Array(nv * 3);
      const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let vo = 0; let io = 0;
      list.forEach((m) => {
        const g = m.geometry; const P = g.attributes.position; const N = g.attributes.normal;
        nm.getNormalMatrix(m.matrixWorld);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
        else for (let i = 0; i < P.count; i++) idx[io + i] = vo + i;
        vo += P.count; io += g.index ? g.index.count : P.count;
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      const merged = new T.Mesh(geo, material); merged.castShadow = cast; merged.receiveShadow = true; scene.add(merged);
    });
  }

  function wall(g, len, along, x, z) {
    const sx = along === 'x' ? len : WALL_T; const sz = along === 'x' ? WALL_T : len;
    g.add(mesh('box', mat(0xF6F3EC), sx, WALL_H, sz, x, WALL_H / 2, z));
    g.add(mesh('box', mat(0x0E7C7B), along === 'x' ? len : WALL_T + 0.02, 0.12, along === 'x' ? WALL_T + 0.02 : len, x, WALL_H - 0.35, z, false));
  }
  function wallWithDoor(g, w, z) {
    const seg = (w - DOOR) / 2;
    wall(g, seg, 'x', -w / 2 + seg / 2, z); wall(g, seg, 'x', w / 2 - seg / 2, z);
  }

  function buildRoom(id) {
    const r = RECT[id]; const g = new T.Group(); g.position.set(r.x, 0, r.z); scene.add(g);
    const floorMat = new T.MeshStandardMaterial({ color: FLOOR[id], roughness: 0.75 });
    const floor = mesh('box', floorMat, r.w, 0.14, r.d, 0, 0.07, 0, false);
    floor.userData.dept = id; floor.userData.dyn = true; floors.push(floor); roomFloors[id] = floor; g.add(floor);
    const conf = id === 'conference';
    if (id !== 'ambulance') { conf ? wallWithDoor(g, r.w, -r.d / 2) : wall(g, r.w, 'x', 0, -r.d / 2); }
    conf ? wall(g, r.w, 'x', 0, r.d / 2) : wallWithDoor(g, r.w, r.d / 2);
    wall(g, r.d, 'z', -r.w / 2, 0); wall(g, r.d, 'z', r.w / 2, 0);
    furnish(id, g, r);
    const label = textSprite(window.World3D._names[id] || id, { w: id === 'conference' ? 10 : 8 });
    label.position.set(r.x, 4.3, r.z - (conf ? 0 : 1.2)); scene.add(label); roomLabels[id] = label;
    standers[id] = [];
  }

  function bedSlotsFor(id, g, r) {
    const n = BEDS[id] || 0; const list = [];
    if (!n) return list;
    const perRow = id === 'theatre' ? 1 : Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow); const col = i % perRow;
      const x = id === 'theatre' ? 0 : -r.w / 2 + 1.4 + col * ((r.w - 2.8) / Math.max(1, perRow - 1));
      const z = id === 'theatre' ? -0.6 : -r.d / 2 + 1.6 + row * 3;
      list.push(makeBed(g, x, z, id === 'theatre'));
    }
    return list;
  }

  function makeBed(g, x, z, table) {
    const b = new T.Group(); b.position.set(x, 0, z); g.add(b);
    if (table) {
      b.add(mesh('cyl', mat(0x9AA5AE, { metalness: 0.5, roughness: 0.4 }), 0.5, 0.8, 0.5, 0, 0.5, 0));
      b.add(mesh('box', mat(0x2F4858), 1.2, 0.18, 2.4, 0, 0.95, 0));
    } else {
      b.add(mesh('box', mat(0xB9C3CA, { metalness: 0.4, roughness: 0.5 }), 1.2, 0.5, 2.3, 0, 0.35, 0));
      b.add(mesh('box', mat(0xFFFFFF), 1.1, 0.2, 2.2, 0, 0.7, 0));
      b.add(mesh('box', mat(0xB9C3CA), 1.2, 0.7, 0.1, 0, 0.75, -1.15));
      b.add(mesh('box', mat(0xFFFFFF), 0.8, 0.14, 0.45, 0, 0.86, -0.8));                    // pillow
      b.add(mesh('cyl', mat(0x9AA5AE), 0.06, 1.6, 0.06, 0.75, 0.8, -1.1));                   // drip stand
    }
    const blanketMat = new T.MeshStandardMaterial({ color: 0xDDE6EA, roughness: 0.9 });
    const blanket = mesh('box', blanketMat, 1.0, 0.18, 1.5, 0, table ? 1.1 : 0.9, 0.3);
    const head = mesh('sph', mat(SKIN[0]), 0.42, 0.42, 0.42, 0, table ? 1.22 : 1.05, -0.75);
    const body = mesh('box', mat(0x9EC4D6), 0.6, 0.28, 0.9, 0, table ? 1.12 : 0.95, -0.15);
    blanket.visible = false; head.visible = false; body.visible = false;
    blanket.userData.dyn = head.userData.dyn = body.userData.dyn = true;
    b.add(blanket, head, body);
    return { group: b, blanket, blanketMat, head, body, pid: null };
  }

  function furnish(id, g, r) {
    const add = (...a) => g.add(mesh(...a));
    if (BEDS[id]) slots[id] = bedSlotsFor(id, g, r);
    if (id === 'ambulance') {
      add('box', mat(0xF2F4F5), r.w, 0.2, 3, 0, 3.4, -r.d / 2 + 1.5);                      // canopy
      [-r.w / 2 + 0.3, r.w / 2 - 0.3].forEach((x) => add('cyl', mat(0xC8CED2), 0.3, 3.4, 0.3, x, 1.7, -r.d / 2 + 0.4));
      for (let i = 0; i < 3; i++) add('box', mat(0xF2F2F2), 0.12, 0.02, 4.2, -3 + i * 3 + 1.5, 0.16, -0.6, false);
    }
    if (id === 'emergency') {
      add('box', mat(0xD7263D, { emissive: 0xD7263D, emissiveIntensity: 0.4 }), 3.2, 0.7, 0.15, 0, 2.4, -r.d / 2 - 0.15);
      add('box', mat(0x2F4858), 1.6, 1.1, 0.8, r.w / 2 - 1.3, 0.55, r.d / 2 - 1.2);           // resus trolley
      add('box', mat(0xE14C5A), 1.4, 0.2, 0.7, r.w / 2 - 1.3, 1.2, r.d / 2 - 1.2);
    }
    if (id === 'radiology') {
      const ring = new T.Mesh(new T.TorusGeometry(1.4, 0.55, 12, 28), mat(0xF4F6F8, { roughness: 0.4 }));
      ring.position.set(-1.5, 1.7, -1.2); ring.castShadow = true; g.add(ring);
      add('box', mat(0xB9C3CA), 0.9, 0.9, 3.4, -1.5, 0.45, 0.6);
      add('box', mat(0x2F4858), 2.2, 1.0, 1.2, 2.8, 0.5, -2.6);                                // console
      add('box', mat(0x0B2233, { emissive: 0x1E5AA8, emissiveIntensity: 0.6 }), 1.6, 0.9, 0.08, 2.8, 1.5, -3.1);
    }
    if (id === 'lab') {
      [-2.4, 1.6].forEach((z) => {
        add('box', mat(0xF0F0F0), r.w - 2, 1.0, 1.1, 0, 0.5, z);
        add('box', mat(0x23303B), r.w - 2, 0.08, 1.15, 0, 1.04, z);
        for (let i = 0; i < 4; i++) add('cyl', mat([0xD7263D, 0xE9B824, 0x1E5AA8, 0x2E9E5B][i]), 0.12, 0.5, 0.12, -3 + i * 2, 1.33, z);
        add('box', mat(0x9AA5AE), 0.5, 0.8, 0.5, 3.2, 1.45, z);                                 // microscope / analyser
      });
    }
    if (id === 'pharmacy') {
      for (let i = 0; i < 3; i++) {
        const x = -3.2 + i * 3.2;
        add('box', mat(0xE9E2D2), 2.6, 2.4, 0.6, x, 1.2, -r.d / 2 + 0.6);
        for (let s = 0; s < 3; s++) for (let k = 0; k < 4; k++)
          add('box', mat([0xFFFFFF, 0x2E9E5B, 0xE9B824, 0x1E5AA8][(i + s + k) % 4]), 0.45, 0.35, 0.3, x - 0.9 + k * 0.6, 0.6 + s * 0.7, -r.d / 2 + 0.85, false);
      }
      add('box', mat(0x2E7D32), r.w - 3, 1.1, 0.8, 0, 0.55, 0.6);                              // dispensing counter
      add('box', mat(0xF4F6F8), r.w - 3, 0.08, 0.9, 0, 1.12, 0.6);
    }
    if (id === 'records') {
      for (let i = 0; i < 4; i++) {
        add('box', mat(0x9AA5AE, { metalness: 0.3 }), 1.4, 2.2, 0.7, -3.6 + i * 1.6, 1.1, -r.d / 2 + 0.6);
        for (let s = 0; s < 4; s++) add('box', mat(0xE8D3A2), 1.2, 0.36, 0.5, -3.6 + i * 1.6, 0.4 + s * 0.5, -r.d / 2 + 0.95, false);
      }
      add('box', mat(0x8B6B4A), 3.2, 1.0, 1.0, 0, 0.5, 0.4); add('box', mat(0x23303B), 0.7, 0.5, 0.06, 0, 1.3, 0.2);
    }
    if (id === 'opd') {
      for (let i = 0; i < 5; i++) add('box', mat(0x1E5AA8), 0.8, 0.5, 0.8, -3.2 + i * 1.6, 0.3, 2.3);
      add('box', mat(0x8B6B4A), 2.2, 0.9, 1.0, 3.2, 0.45, 0.3);
    }
    if (id === 'theatre') {
      const lamp = new T.Group(); lamp.position.set(0, 3.1, -0.6);
      lamp.add(mesh('cyl', mat(0xDDE3E8), 1.6, 0.25, 1.6, 0, 0, 0));
      lamp.add(mesh('cyl', mat(0xFFFFFF, { emissive: 0xFFF6D8, emissiveIntensity: 1 }), 1.2, 0.05, 1.2, 0, -0.14, 0, false));
      g.add(lamp);
      add('box', mat(0x2F4858), 1.0, 1.5, 0.8, 2.6, 0.75, -1.5);                                // anaesthetic machine
      add('box', mat(0x0B2233, { emissive: 0x2E9E5B, emissiveIntensity: 0.6 }), 0.8, 0.5, 0.06, 2.6, 1.7, -1.9);
    }
    if (id === 'maternity') add('box', mat(0xF7C9D7), 0.9, 0.7, 0.9, r.w / 2 - 1, 0.5, r.d / 2 - 1.4); // cot
    if (id === 'paeds') {
      [0xD7263D, 0x1E5AA8, 0xE9B824].forEach((c, i) => add('sph', mat(c), 0.6, 0.6, 0.6, -3 + i * 0.9, 0.35, r.d / 2 - 1.2));
    }
    if (id === 'conference') {
      add('box', mat(0x6B4A2F), r.w - 14, 0.9, 2.0, 0, 0.45, 0);
      for (let i = 0; i < 10; i++) [-1.6, 1.6].forEach((z) => add('box', mat(0x23303B), 0.7, 0.7, 0.7, -12 + i * 2.7, 0.35, z));
      add('box', mat(0x0B2233, { emissive: 0x1E5AA8, emissiveIntensity: 0.5 }), 5, 2.4, 0.15, 0, 1.9, r.d / 2 - 0.3);
    }
  }

  function buildSign() {
    const g = new T.Group(); g.position.set(colX(2), 0, ROAD_Z + 4.5); scene.add(g);
    [-3.2, 3.2].forEach((x) => g.add(mesh('box', mat(0x23303B), 0.3, 2.6, 0.3, x, 1.3, 0)));
    g.add(mesh('box', mat(0x0E7C7B), 7.2, 1.2, 0.25, 0, 2.6, 0));
    const s = textSprite('Akwaaba Teaching Hospital', { w: 9, bg: 'rgba(14,124,123,0)', size: 44 });
    s.position.set(colX(2), 2.65, ROAD_Z + 4.2); scene.add(s);
  }
  function buildTrees() {
    const spots = [];
    for (let i = 0; i < 46; i++) {
      const side = i % 4; const t = rnd('tree', i);
      let x; let z;
      if (side === 0) { x = -40 - t * 30; z = -20 + rnd('tz', i) * 60; }
      else if (side === 1) { x = 34 + t * 30; z = -20 + rnd('tz', i) * 60; }
      else if (side === 2) { x = -60 + t * 120; z = ROAD_Z - 8 - rnd('tz', i) * 20; }
      else { x = -60 + t * 120; z = RECT.conference.z + 8 + rnd('tz', i) * 18; }
      spots.push([x, z, 0.8 + rnd('ts', i) * 0.7]);
    }
    spots.forEach(([x, z, s], i) => {
      scene.add(mesh('cyl', mat(0x6B4A2F), 0.4 * s, 2.2 * s, 0.4 * s, x, 1.1 * s, z));
      const leaf = i % 3 === 0 ? mesh('cone', mat(0x2F6B3A), 2.6 * s, 3.6 * s, 2.6 * s, x, 3.6 * s, z) : mesh('sph', mat(i % 2 ? 0x3E7D3E : 0x4F8F45), 3 * s, 2.6 * s, 3 * s, x, 3.2 * s, z);
      scene.add(leaf);
    });
  }
  function buildCarPark() {
    const z0 = RECT.conference.z + 7; const cols = [0xD7263D, 0xF4F6F8, 0x23303B, 0x1E5AA8, 0xE9B824];
    scene.add(mesh('box', mat(0x5A646C), 30, 0.05, 6, 0, 0.03, z0, false));
    for (let i = 0; i < 6; i++) {
      if (rnd('car', i) < 0.25) continue;
      const g = new T.Group(); g.position.set(-12.5 + i * 5, 0, z0);
      g.add(mesh('box', mat(cols[i % cols.length], { metalness: 0.3, roughness: 0.4 }), 1.8, 0.8, 3.6, 0, 0.7, 0));
      g.add(mesh('box', mat(0x9FC4D8, { metalness: 0.4, roughness: 0.2 }), 1.6, 0.6, 1.9, 0, 1.35, 0.1));
      scene.add(g);
    }
  }
  function buildLamps() {
    for (let x = -50; x <= 50; x += 14) {
      scene.add(mesh('cyl', mat(0x4A5560), 0.18, 4.6, 0.18, x, 2.3, ROAD_Z + 3.6));
      const bulb = mesh('sph', new T.MeshStandardMaterial({ color: 0xFFF2C4, emissive: 0xFFD27A, emissiveIntensity: 0 }), 0.6, 0.4, 0.6, x, 4.6, ROAD_Z + 3.2, false);
      bulb.userData.dyn = true; scene.add(bulb); lamps.push(bulb);
    }
  }

  // ---------- people ----------
  function makePerson(color, opts = {}) {
    const g = new T.Group();
    const legs = [-0.17, 0.17].map((x) => { const l = mesh('box', mat(0x23303B), 0.22, 0.75, 0.24, x, 0.38, 0); g.add(l); return l; });
    g.add(mesh('cyl', mat(color), 0.62, 0.95, 0.5, 0, 1.2, 0));                     // scrubs / gown
    g.add(mesh('sph', mat(opts.skin ?? SKIN[0]), 0.48, 0.5, 0.48, 0, 1.95, 0));
    if (opts.cap) g.add(mesh('cyl', mat(opts.cap), 0.5, 0.14, 0.5, 0, 2.18, 0));
    if (opts.coat) g.add(mesh('box', mat(0xFFFFFF), 0.66, 0.9, 0.08, 0, 1.2, 0.24));
    g.userData.legs = legs;
    return g;
  }

  function avatarFor(p) {
    const skin = SKIN[hash(p.uid) % SKIN.length];
    const role = p.role;
    const g = makePerson(ROLE_COL[role] || 0x667788, { skin, cap: role === 'midwife' || role === 'nurse' ? 0xFFFFFF : null, coat: role === 'doctor' });
    const label = textSprite(p.name, { w: 4.8, size: 44 });
    label.position.y = 3.2; g.add(label);
    scene.add(g);
    return { g, label, dept: null, path: [], t: Math.random() * 10 };
  }

  function spotIn(dept, seed) {
    const r = RECT[dept]; const conf = dept === 'conference';
    const x = r.x + (rnd(seed, 1) - 0.5) * (r.w - (conf ? 4 : 2.4));
    const z = conf ? r.z + (rnd(seed, 2) - 0.5) * 3.8 : r.z + r.d / 2 - 1.2 - rnd(seed, 2) * 2.2;
    return new T.Vector3(x, 0, z);
  }
  function doorIn(dept) { const r = RECT[dept]; return new T.Vector3(r.x, 0, dept === 'conference' ? r.z - r.d / 2 : r.z + r.d / 2); }
  function doorOut(dept) { const r = RECT[dept]; return new T.Vector3(r.x, 0, dept === 'conference' ? r.z - r.d / 2 - G / 2 : r.z + r.d / 2 + G / 2); }
  function pathBetween(from, to, pos, dest) {
    const A = doorOut(from); const B = doorOut(to);
    const pts = [doorIn(from), A];
    if (Math.abs(A.z - B.z) > 0.1) {
      const xg = GAPS.reduce((best, g) => (Math.abs(g - A.x) + Math.abs(g - B.x) < Math.abs(best - A.x) + Math.abs(best - B.x) ? g : best), GAPS[0]);
      pts.push(new T.Vector3(xg, 0, A.z), new T.Vector3(xg, 0, B.z));
    }
    pts.push(B, doorIn(to), dest);
    return pts;
  }

  // ---------- ambulances ----------
  function makeAmbulance() {
    const g = new T.Group();
    g.add(mesh('box', mat(0xFFFFFF, { roughness: 0.4 }), 3.4, 1.9, 2.0, 0.5, 1.35, 0));       // box body
    g.add(mesh('box', mat(0xFFFFFF, { roughness: 0.4 }), 1.4, 1.4, 1.9, -1.9, 1.1, 0));      // cab
    g.add(mesh('box', mat(0x9FC4D8, { metalness: 0.4, roughness: 0.2 }), 0.08, 0.6, 1.7, -2.62, 1.45, 0)); // windscreen
    g.add(mesh('box', mat(0xD7263D), 4.85, 0.28, 2.04, -0.2, 1.0, 0, false));                  // stripe
    g.add(mesh('box', mat(0x1E9E4B), 4.85, 0.12, 2.05, -0.2, 0.8, 0, false));                  // Ghana green trim
    const cross = new T.Group(); cross.position.set(0.5, 2.33, 0);
    cross.add(mesh('box', mat(0xD7263D), 0.9, 0.04, 0.3, 0, 0, 0, false), mesh('box', mat(0xD7263D), 0.3, 0.04, 0.9, 0, 0, 0, false));
    g.add(cross);
    const red = new T.MeshStandardMaterial({ color: 0x7A0F1A, emissive: 0xFF1E36, emissiveIntensity: 0 });
    const blue = new T.MeshStandardMaterial({ color: 0x0F2A6B, emissive: 0x2E7BFF, emissiveIntensity: 0 });
    g.add(mesh('box', red, 0.3, 0.2, 0.7, -1.7, 1.9, -0.45, false), mesh('box', blue, 0.3, 0.2, 0.7, -1.7, 1.9, 0.45, false));
    [[-1.7, 0.95], [-1.7, -0.95], [1.3, 0.95], [1.3, -0.95]].forEach(([x, z]) => {
      const w = mesh('wheel', mat(0x1C2228), 1, 1, 1, x, 0.42, z); w.rotation.x = Math.PI / 2; g.add(w);
    });
    scene.add(g);
    return { g, red, blue, siren: false };
  }
  const BAY = RECT.ambulance;
  const BAY_SLOTS = [0, 1, 2].map((i) => new T.Vector3(BAY.x - 3 + i * 3, 0, BAY.z - 0.6));
  const FAR_X = 70;
  // p: 0 = far away on the road (east), 1 = parked in its bay slot
  function placeAmbulance(a, p, slot) {
    const park = BAY_SLOTS[slot % 3]; const g = a.g;
    if (p < 0.82) {
      const k = p / 0.82; g.position.set(FAR_X + (park.x - FAR_X) * k, 0, ROAD_Z + 1.4);
      g.rotation.y = 0;                                               // nose west, driving towards the bay
    } else {
      const k = (p - 0.82) / 0.18; g.position.set(park.x, 0, ROAD_Z + 1.4 + (park.z - ROAD_Z - 1.4) * k);
      g.rotation.y = Math.PI / 2;                                     // turned in, nose into the bay
    }
    g.visible = g.position.x < FAR_X - 2;
  }

  // ---------- update from server state ----------
  function update(st, meIn, myDeptIn) {
    if (!renderer) return;
    lastState = st; me = meIn; myDept = myDeptIn;
    const byRoom = {};
    st.patients.forEach((p) => { if (!HIDDEN.includes(p.stage) && RECT[p.loc]) (byRoom[p.loc] = byRoom[p.loc] || []).push(p); });

    // room labels and the floor of my room
    Object.keys(RECT).forEach((id) => {
      const n = (byRoom[id] || []).length; const name = window.World3D._names[id] || id;
      setSpriteText(roomLabels[id], n ? `${name}\n${n} patient${n > 1 ? 's' : ''}` : name);
      roomFloors[id].material.emissive.setHex(id === myDept ? 0x0E7C7B : 0x000000);
      roomFloors[id].material.emissiveIntensity = id === myDept ? 0.18 : 0;
    });

    // patients on beds, or standing where there are no beds
    Object.keys(RECT).forEach((id) => {
      const list = (byRoom[id] || []).slice().sort((a, b) => (a.bed || 0) - (b.bed || 0) || a.pid.localeCompare(b.pid));
      const bedList = slots[id] || [];
      const keep = new Set(list.map((p) => p.pid));
      bedList.forEach((s) => { if (s.pid && !keep.has(s.pid)) s.pid = null; });
      const placed = new Set(bedList.filter((s) => s.pid).map((s) => s.pid));
      list.forEach((p) => { if (!placed.has(p.pid)) { const free = bedList.find((s) => !s.pid); if (free) { free.pid = p.pid; placed.add(p.pid); } } });
      bedList.forEach((s) => {
        const p = s.pid && list.find((x) => x.pid === s.pid);
        s.blanket.visible = s.head.visible = s.body.visible = !!p;
        if (p) {
          s.blanketMat.color.setHex(TRI[p.tri] || 0x9AA9B2);
          s.low = p.stab < 30; s.head.material = mat(SKIN[hash(p.pid) % SKIN.length]);
        } else s.low = false;
      });
      const rest = list.filter((p) => !placed.has(p.pid));
      const pool = standers[id];
      while (pool.length < Math.min(rest.length, 8)) {
        const f = makePerson(0x9EC4D6); f.userData.gown = f.children[2]; scene.add(f); pool.push(f);
      }
      pool.forEach((f, i) => {
        const p = rest[i]; f.visible = !!p; if (!p) return;
        const r = RECT[id]; const pos = id === 'ambulance' ? new T.Vector3(r.x + 3.6, 0, r.z + 2.2 - i * 0.9) : new T.Vector3(r.x - r.w / 2 + 1.2 + (i % 4) * 1.1, 0, r.z + r.d / 2 - 1 - Math.floor(i / 4) * 1.1);
        f.position.copy(pos); f.rotation.y = Math.PI;
        f.userData.gown.material = mat(p.tri ? TRI[p.tri] : 0x9EC4D6);
      });
    });

    // staff
    const seen = new Set();
    st.players.slice(0, 150).forEach((p) => {
      seen.add(p.uid);
      let a = avatars.get(p.uid);
      if (!a) { a = avatarFor(p); avatars.set(p.uid, a); }
      const dept = p.uid === me?.uid ? myDept : p.dept;
      if (!RECT[dept]) return;
      if (a.dept !== dept) {
        const dest = spotIn(dept, p.uid);
        if (a.dept && RECT[a.dept]) a.path = pathBetween(a.dept, dept, a.g.position, dest);
        else { a.g.position.copy(dest); a.path = []; }
        a.dept = dept;
      }
      a.label.visible = p.uid === me?.uid || st.players.length <= 40;
      if (p.uid === me?.uid && a.label.userData.text !== p.name) setSpriteText(a.label, p.name);
      a.isMe = p.uid === me?.uid;
    });
    avatars.forEach((a, uid) => { if (!seen.has(uid)) { scene.remove(a.g); avatars.delete(uid); } });

    // ambulances: hospital fleet plus ambulances bringing patients in
    const want = new Map();
    (st.fleet || []).forEach((u, i) => {
      let p = 1; let siren = false;
      if (u.status === 'out' || u.status === 'transfer') { p = Math.max(0, u.left / u.total); siren = true; }
      if (u.status === 'back') { p = 1 - u.left / u.total; siren = false; }
      want.set(`u${i}`, { p, siren, slot: i });
    });
    let extra = 0;
    st.patients.forEach((p) => {
      if (p.stage === 'en_route' && extra < 3) { want.set(`p${p.pid}`, { p: 1 - p.eta / Math.max(1, p.eta_total), siren: true, slot: (st.fleet || []).length ? 1 + extra : extra }); extra++; }
    });
    if (!(st.fleet || []).length) st.patients.filter((p) => p.loc === 'ambulance' && ['arrived', 'transfer'].includes(p.stage)).slice(0, 3)
      .forEach((p, i) => want.set(`p${p.pid}`, { p: 1, siren: false, slot: i }));
    want.forEach((w, key) => {
      let a = ambs.get(key); if (!a) { a = makeAmbulance(); ambs.set(key, a); }
      a.target = w.p; if (a.p === undefined) a.p = w.p; a.siren = w.siren; a.slot = w.slot;
    });
    ambs.forEach((a, key) => { if (!want.has(key)) { scene.remove(a.g); ambs.delete(key); } });

    // event marker: ward round or meeting room
    const evDept = st.session ? st.session.dept : st.next && st.next.round_ward;
    eventMarker.visible = !!(evDept && RECT[evDept]);
    if (eventMarker.visible) eventMarker.position.set(RECT[evDept].x + RECT[evDept].w / 2 - 1.2, 5.2, RECT[evDept].z - RECT[evDept].d / 2 + 1);

    applyLighting(st);
  }

  function applyLighting(st) {
    const d = new Date(st.now * 1000); const h = d.getUTCHours() + d.getUTCMinutes() / 60;   // Accra is UTC+0
    const day = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    const dusk = Math.max(0, 1 - Math.abs(h - 18.3) / 1.4) + Math.max(0, 1 - Math.abs(h - 6) / 1.2);
    const sky = new T.Color(0x0B1630).lerp(new T.Color(0x9CCBE8), day).lerp(new T.Color(0xF29E5C), Math.min(0.5, dusk * 0.5));
    const cut = st.power ? 0.45 : 1;
    scene.background = sky; scene.fog.color.copy(sky);
    sun.intensity = (0.2 + 0.95 * day) * cut;
    sun.position.set(Math.cos(((h - 6) / 12) * Math.PI) * 60, 30 + day * 50, 30);
    hemi.intensity = (0.35 + 0.45 * day) * cut;
    hemi.color.setHex(st.power ? 0xFFB3A0 : 0xFFFFFF);
    lamps.forEach((l) => { l.material.emissiveIntensity = (1 - day) * 1.4; });
  }

  // ---------- animation ----------
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
    const t = now / 1000;

    avatars.forEach((a) => {
      const g = a.g; a.t += dt;
      if (a.path.length) {
        const next = a.path[0]; const dx = next.x - g.position.x; const dz = next.z - g.position.z; const dist = Math.hypot(dx, dz);
        const step = 7.5 * dt;
        if (dist <= step) { g.position.set(next.x, 0, next.z); a.path.shift(); }
        else { g.position.x += (dx / dist) * step; g.position.z += (dz / dist) * step; g.rotation.y = Math.atan2(dx, dz); }
        const sw = Math.sin(a.t * 12) * 0.5;
        g.userData.legs[0].rotation.x = sw; g.userData.legs[1].rotation.x = -sw;
        g.position.y = Math.abs(Math.sin(a.t * 12)) * 0.08;
      } else {
        g.userData.legs.forEach((l) => { l.rotation.x = 0; }); g.position.y = 0;
        g.rotation.y += Math.sin(a.t * 0.7 + g.position.x) * 0.002;
      }
      if (a.isMe) {
        meRing.visible = true; meRing.position.set(g.position.x, 0.18, g.position.z);
        meRing.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
        if (cam.follow) cam.target.lerp(new T.Vector3(g.position.x, 0, g.position.z), 0.06);
      }
    });

    Object.values(slots).forEach((list) => list.forEach((s) => {
      s.blanketMat.emissive.setHex(s.low ? 0xFF0000 : 0x000000);
      s.blanketMat.emissiveIntensity = s.low ? 0.35 + Math.sin(t * 8) * 0.35 : 0;
    }));

    ambs.forEach((a) => {
      a.p += (a.target - a.p) * Math.min(1, dt * 1.5);
      placeAmbulance(a, a.p, a.slot);
      const on = a.siren && Math.floor(t * 5) % 2 === 0;
      a.red.emissiveIntensity = a.siren ? (on ? 2.2 : 0.1) : 0;
      a.blue.emissiveIntensity = a.siren ? (on ? 0.1 : 2.2) : 0;
    });

    eventMarker.position.y = 5.2 + Math.sin(t * 3) * 0.35; eventMarker.rotation.y += dt * 1.5;
    placeCamera();
    renderer.render(scene, camera);
  }

  function placeCamera() {
    const c = Math.cos(cam.pitch); const tg = cam.target;
    camera.position.set(tg.x + cam.dist * c * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch), tg.z + cam.dist * c * Math.cos(cam.yaw));
    camera.lookAt(tg);
  }

  // ---------- input: drag to rotate, pinch or wheel to zoom, tap a room to walk ----------
  function bindInput(el) {
    const pts = new Map(); let down = null; let pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) down = { x: e.clientX, y: e.clientY, moved: 0 };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); const dx = e.clientX - prev.x; const dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1 && down) {
        down.moved += Math.abs(dx) + Math.abs(dy);
        cam.yaw -= dx * 0.006; cam.pitch = Math.min(1.42, Math.max(0.32, cam.pitch + dy * 0.004));
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) cam.dist = Math.min(130, Math.max(16, cam.dist * (pinch / d)));
        pinch = d; if (down) down.moved = 99;
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size === 0 && down && down.moved < 8) tap(e);
      if (pts.size === 0) down = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); down = null; });
    el.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.min(130, Math.max(16, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
  }
  function tap(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    const hit = raycaster.intersectObjects(floors, false)[0];
    if (hit && onRoom) onRoom(hit.object.userData.dept);
  }

  function resize() {
    if (!renderer || !container.clientWidth) return;
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix();
  }

  // ---------- public ----------
  window.World3D = {
    _names: {},
    supported() {
      try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
      catch (_) { return false; }
    },
    init(el, cfg, onRoomCb) {
      if (renderer) return true;
      if (!this.supported()) return false;
      container = el; onRoom = onRoomCb;
      Object.entries(cfg.depts).forEach(([k, v]) => { this._names[k] = v.name; });
      renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Math.min(window.innerWidth, window.innerHeight) < 500 ? 1.5 : 1.75));
      renderer.outputEncoding = T.sRGBEncoding;
      const small = Math.min(window.innerWidth, window.innerHeight) < 500;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = small ? T.PCFShadowMap : T.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);
      scene = new T.Scene(); scene.fog = new T.Fog(0x9CCBE8, 110, 240);
      camera = new T.PerspectiveCamera(42, 1, 0.5, 600);
      hemi = new T.HemisphereLight(0xFFFFFF, 0x5B6B4A, 0.7); scene.add(hemi);
      sun = new T.DirectionalLight(0xFFF4E0, 1); sun.castShadow = true;
      sun.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536);
      Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
      sun.target.position.set(0, 0, rowZ(1)); scene.add(sun, sun.target);
      raycaster = new T.Raycaster();
      buildWorld(); bindInput(renderer.domElement);
      new ResizeObserver(resize).observe(el); resize();
      running = true; requestAnimationFrame(frame);
      return true;
    },
    update,
    setVisible(v) { visible = v; if (v) resize(); },
    follow(on) { cam.follow = on; if (!on) cam.target.set(0, 0, rowZ(1) + 3); },
    zoom(f) { cam.dist = Math.min(130, Math.max(16, cam.dist * f)); },
    reset() { Object.assign(cam, { yaw: 0.55, pitch: 0.92, dist: 68, follow: false }); cam.target.set(0, 0, rowZ(1) + 3); },
  };
})();
