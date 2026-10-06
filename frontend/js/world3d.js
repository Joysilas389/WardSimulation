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

  const WALLS = [];
  const BOUNDS = { x0: -46, x1: 46, z0: ROAD_Z - 2.5, z1: RECT.conference.z + 13 };
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
    torso: new T.CylinderGeometry(0.27, 0.21, 0.62, 14), skirt: new T.CylinderGeometry(0.23, 0.36, 0.62, 14),
    coat: new T.CylinderGeometry(0.31, 0.36, 0.98, 14, 1, true), limb: new T.CylinderGeometry(0.5, 0.42, 1, 10),
    hairCap: new T.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), blob: new T.CircleGeometry(0.5, 20),
    ring: new T.TorusGeometry(0.5, 0.06, 6, 20),
  };
  function kente(seed) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
    const pals = [['#E9B824', '#1E7A3A', '#C8102E', '#111'], ['#E9B824', '#0E5AA8', '#2E9E5B', '#111'], ['#D35400', '#E9B824', '#6B2D86', '#111']];
    const p = pals[seed % pals.length];
    for (let y = 0; y < 64; y += 8) { g.fillStyle = p[(y / 8) % 4]; g.fillRect(0, y, 64, 8); }
    for (let x = 0; x < 64; x += 16) { g.fillStyle = p[(x / 16 + 1) % 4]; g.fillRect(x, 0, 6, 64); }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2);
    return new T.MeshStandardMaterial({ map: t, roughness: 0.9 });
  }
  const KENTE = [0, 1, 2].map(kente);
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
    const cx = g.position.x + x; const cz = g.position.z + z;
    WALLS.push({ x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 });
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

  // ---------- state ----------
  let renderer, scene, camera, container, sun, hemi, raycaster, onRoom, sendFn;
  let visible = true; let running = false; let lastT = 0; let clock = 0;
  const floors = []; const roomLabels = {}; const roomFloors = {};
  const slots = {};          // dept -> beds
  const standers = {};       // dept -> standing patients
  const avatars = new Map(); // uid -> player character
  const npcs = [];
  const ambs = new Map();
  const lamps = [];
  let meRing, eventMarker, me = null, myDept = null;
  const cam = { yaw: 0.55, pitch: 0.92, dist: 68, target: new T.Vector3(0, 0, rowZ(1) + 3), mode: 'overview' };
  const ctl = { jx: 0, jy: 0, keys: {}, lastSend: 0, sent: '', auto: [] };

  // ---------- people ----------
  const HAIR = [0x1A1110, 0x241812, 0x0E0B0A];
  function makeHuman(o) {
    const root = new T.Group();
    const skin = mat(o.skin); const top = o.topMat || mat(o.top); const bottom = o.bottomMat || mat(o.bottom);
    const shoe = mat(o.shoes || 0x1C2228); const sleeve = o.coat ? mat(0xFFFFFF) : top;
    const P = (geo, m, sx, sy, sz, x, y, z, parent) => { const p = mesh(geo, m, sx, sy, sz, x, y, z, false); parent.add(p); return p; };

    const hips = new T.Group(); hips.position.y = 1.0; root.add(hips);
    P('box', bottom, 0.46, 0.22, 0.28, 0, 0, 0, hips);
    if (o.skirt) P('skirt', o.skirtMat || top, 1, 1, 0.8, 0, -0.26, 0, hips);
    const legs = [-1, 1].map((s) => {
      const hip = new T.Group(); hip.position.set(0.12 * s, -0.05, 0); hips.add(hip);
      P('limb', o.skirt ? skin : bottom, 0.21, 0.5, 0.21, 0, -0.25, 0, hip);
      const knee = new T.Group(); knee.position.y = -0.5; hip.add(knee);
      P('limb', o.skirt ? skin : bottom, 0.16, 0.45, 0.16, 0, -0.22, 0, knee);
      P('box', shoe, 0.17, 0.1, 0.32, 0, -0.47, 0.06, knee);
      return { hip, knee };
    });

    const torso = new T.Group(); torso.position.y = 1.05; root.add(torso);
    P('torso', top, 1, 1, 0.7, 0, 0.3, 0, torso);
    if (o.coat) { const c = P('coat', mat(0xFFFFFF, { side: T.DoubleSide }), 1, 1, 0.74, 0, 0.13, 0, torso); c.renderOrder = 1; }
    if (o.vneck) P('box', skin, 0.12, 0.1, 0.02, 0, 0.56, 0.19, torso);
    P('cyl', skin, 0.13, 0.15, 0.13, 0, 0.67, 0, torso);
    if (o.stetho) { const r = P('ring', mat(0x23303B), 0.34, 0.34, 0.34, 0, 0.58, 0.02, torso); r.rotation.x = Math.PI / 2 - 0.25; P('cyl', mat(0x9AA5AE), 0.08, 0.03, 0.08, 0.06, 0.32, 0.2, torso).rotation.x = Math.PI / 2; }

    const head = new T.Group(); head.position.y = 0.88; torso.add(head);
    P('sph', skin, 0.34, 0.39, 0.35, 0, 0, 0, head);
    [-1, 1].forEach((s) => P('sph', mat(0x111111), 0.05, 0.06, 0.03, 0.065 * s, 0.03, 0.165, head));
    const mouth = P('box', mat(0x5A1E1E), 0.09, 0.022, 0.02, 0, -0.085, 0.165, head);
    const hairM = mat(o.hairCol ?? HAIR[0]);
    if (o.hair === 'wrap') {
      P('cyl', o.wrapMat || KENTE[0], 0.4, 0.2, 0.42, 0, 0.12, -0.01, head);
      P('sph', o.wrapMat || KENTE[0], 0.2, 0.16, 0.2, 0.05, 0.25, -0.05, head);
    } else if (o.hair !== 'bald') {
      P('hairCap', hairM, o.hair === 'low' ? 0.355 : 0.38, o.hair === 'low' ? 0.38 : 0.42, o.hair === 'low' ? 0.365 : 0.39, 0, 0.0, -0.01, head);
      if (o.hair === 'bun') P('sph', hairM, 0.17, 0.17, 0.17, 0, 0.12, -0.17, head);
    }
    if (o.cap) P('cyl', mat(0xFFFFFF), 0.3, 0.09, 0.3, 0, 0.2, 0.02, head);
    if (o.basin) { P('cyl', mat(0xC0392B), 0.5, 0.14, 0.5, 0, 0.27, 0, head); for (let i = 0; i < 5; i++) P('box', mat(0xDCEFFF, { transparent: true, opacity: 0.8 }), 0.12, 0.05, 0.16, -0.12 + i * 0.06, 0.36, (i % 2) * 0.06 - 0.03, head); }

    const arms = [-1, 1].map((s) => {
      const sh = new T.Group(); sh.position.set(0.32 * s, 0.55, 0); sh.rotation.z = 0.09 * s; torso.add(sh);
      P('limb', sleeve, 0.17, 0.2, 0.17, 0, -0.08, 0, sh);
      P('limb', o.coat ? sleeve : skin, 0.13, 0.32, 0.13, 0, -0.18, 0, sh);
      const el = new T.Group(); el.position.y = -0.33; sh.add(el);
      P('limb', o.coat ? sleeve : skin, 0.12, 0.28, 0.12, 0, -0.14, 0, el);
      P('sph', skin, 0.12, 0.13, 0.11, 0, -0.31, 0, el);
      if (o.mop && s === 1) { const m = P('cyl', mat(0x8B6B4A), 0.05, 1.7, 0.05, 0, -0.5, 0.15, el); m.rotation.x = 0.25; P('box', mat(0x2E9E5B), 0.5, 0.12, 0.25, 0, -1.3, 0.35, el); }
      return { sh, el, s };
    });

    const blob = new T.Mesh(GEO.blob, new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.17; blob.scale.setScalar(1.1); root.add(blob);
    return { root, hips, legs, torso, head, mouth, arms, phase: Math.random() * 6, walkW: 0, talkUntil: 0, seed: Math.random() * 10, bubble: null };
  }

  function animateHuman(h, dt, moving, t) {
    h.walkW += ((moving ? 1 : 0) - h.walkW) * Math.min(1, dt * 8);
    const w = h.walkW; h.phase += dt * 9 * Math.max(0.15, w); const p = h.phase;
    h.legs[0].hip.rotation.x = -Math.sin(p) * 0.6 * w; h.legs[1].hip.rotation.x = Math.sin(p) * 0.6 * w;
    h.legs[0].knee.rotation.x = Math.max(0, Math.sin(p + 1.7)) * 0.95 * w; h.legs[1].knee.rotation.x = Math.max(0, Math.sin(p + 1.7 + Math.PI)) * 0.95 * w;
    const bob = Math.abs(Math.cos(p)) * 0.05 * w;
    h.hips.position.y = 1.0 + bob; h.torso.position.y = 1.05 + bob;
    h.torso.rotation.y = Math.sin(p) * 0.08 * w;
    const talking = t < h.talkUntil;
    h.arms.forEach((a, i) => {
      const swing = (i === 0 ? 1 : -1) * Math.sin(p) * 0.55 * w;
      let x = swing; let el = -0.12 - 0.3 * w; let z = 0.09 * a.s;
      if (talking && i === 1 && !h.mopper) { x = -0.75 + Math.sin(t * 4 + h.seed) * 0.3; el = -0.9; z = 0.3; }
      a.sh.rotation.x += (x - a.sh.rotation.x) * Math.min(1, dt * 10); a.el.rotation.x += (el - a.el.rotation.x) * Math.min(1, dt * 10); a.sh.rotation.z = z;
    });
    h.torso.scale.y = 1 + Math.sin(t * 2 + h.seed) * 0.012 * (1 - w);
    h.head.rotation.y = Math.sin(t * 0.5 + h.seed) * 0.35 * (1 - w);
    h.head.rotation.x = talking ? Math.sin(t * 6 + h.seed) * 0.09 : 0;
    h.mouth.scale.y = talking ? 1 + Math.abs(Math.sin(t * 17 + h.seed)) * 3.5 : 1;
    if (h.bubble) h.bubble.visible = talking;
  }

  function wrapText(s, n = 24) {
    const words = String(s).split(/\s+/); const lines = ['']; 
    words.forEach((w) => { if ((lines[lines.length - 1] + ' ' + w).trim().length > n && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); });
    if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].slice(0, n - 1) + '…'; }
    return lines;
  }
  function say(h, text, secs = 5) {
    if (!h.bubble) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
      h.bubble = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      h.bubble.userData = { c, tex }; h.bubble.scale.set(4.4, 2.2, 1); h.bubble.position.y = 3.65; h.bubble.renderOrder = 20;
      h.root.add(h.bubble);
    }
    const { c, tex } = h.bubble.userData; const g = c.getContext('2d'); const lines = wrapText(text);
    g.clearRect(0, 0, 512, 256);
    g.font = '600 40px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
    const w = Math.min(500, Math.max(...lines.map((l) => g.measureText(l).width)) + 56); const hgt = 34 + lines.length * 50;
    const x = (512 - w) / 2; const y = 214 - hgt;
    g.fillStyle = '#FFFFFF'; g.strokeStyle = 'rgba(20,35,58,.35)'; g.lineWidth = 4;
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hgt, 30) : g.rect(x, y, w, hgt); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(236, 212); g.lineTo(256, 246); g.lineTo(276, 212); g.fill();
    g.fillStyle = '#14233A'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, 256, y + 42 + i * 50));
    tex.needsUpdate = true;
    h.talkUntil = clock + secs;
  }

  function looksFor(role, seed) {
    const female = hash(seed) % 2 === 0; const skin = SKIN[hash(seed + 'k') % SKIN.length];
    const base = { skin, top: ROLE_COL[role] || 0x667788, bottom: ROLE_COL[role] || 0x667788, vneck: true,
      hair: female ? ['bun', 'short', 'low'][hash(seed + 'h') % 3] : 'low', hairCol: HAIR[hash(seed) % 3] };
    if (role === 'doctor') Object.assign(base, { coat: true, stetho: true, bottom: 0x2F3E4E });
    if (role === 'student') Object.assign(base, { coat: true, top: 0x5B6CF0, bottom: 0x2F3E4E });
    if (role === 'nurse' || role === 'midwife') Object.assign(base, { cap: true, skirt: female, hair: female ? 'bun' : 'low' });
    if (role === 'pharmacist' || role === 'lab_scientist') Object.assign(base, { coat: true, bottom: 0x2F3E4E });
    if (role === 'paramedic') Object.assign(base, { top: 0x1E7A3A, bottom: 0x1E7A3A, vneck: false });
    return base;
  }

  function avatarFor(p) {
    const h = makeHuman(looksFor(p.role, p.uid + p.name));
    const label = textSprite(p.name, { w: 4.2, size: 44 }); label.position.y = 2.75; h.root.add(label);
    scene.add(h.root);
    return { h, label, dept: null, path: [], target: null, hasPos: false, moving: false, name: p.name };
  }

  // ---------- routes through the corridors ----------
  function spotIn(dept, seed) {
    const r = RECT[dept]; const conf = dept === 'conference';
    const x = r.x + (rnd(seed, 1) - 0.5) * (r.w - (conf ? 4 : 2.4));
    const z = conf ? r.z + (rnd(seed, 2) > 0.5 ? 1.9 : -1.9) : r.z + r.d / 2 - 1.2 - rnd(seed, 2) * 2.2;
    return new T.Vector3(x, 0, z);
  }
  function doorIn(dept) { const r = RECT[dept]; return new T.Vector3(r.x, 0, dept === 'conference' ? r.z - r.d / 2 : r.z + r.d / 2); }
  function doorOut(dept) { const r = RECT[dept]; return new T.Vector3(r.x, 0, dept === 'conference' ? r.z - r.d / 2 - G / 2 : r.z + r.d / 2 + G / 2); }
  function roomAt(x, z, margin = 0.3) {
    for (const [id, r] of Object.entries(RECT)) if (Math.abs(x - r.x) < r.w / 2 - margin && Math.abs(z - r.z) < r.d / 2 - margin) return id;
    return null;
  }
  function nearestGap(x) { return GAPS.reduce((b, g) => (Math.abs(g - x) < Math.abs(b - x) ? g : b), GAPS[0]); }
  function corridorRoute(P, B) {   // P and B are in corridors
    const pts = [];
    const onGap = GAPS.find((g) => Math.abs(P.x - g) < G / 2);
    if (onGap !== undefined) pts.push(new T.Vector3(onGap, 0, B.z));
    else if (Math.abs(P.z - B.z) > 0.2) {
      const xg = GAPS.reduce((best, g) => (Math.abs(g - P.x) + Math.abs(g - B.x) < Math.abs(best - P.x) + Math.abs(best - B.x) ? g : best), GAPS[0]);
      pts.push(new T.Vector3(xg, 0, P.z), new T.Vector3(xg, 0, B.z));
    }
    pts.push(B.clone());
    return pts;
  }
  function routeTo(pos, toDept, dest) {
    const from = roomAt(pos.x, pos.z, 0);
    const pts = [];
    let P = pos.clone();
    if (from === toDept) return [dest];
    if (from) { pts.push(doorIn(from), doorOut(from)); P = doorOut(from); }
    pts.push(...corridorRoute(P, doorOut(toDept)), doorIn(toDept), dest);
    return pts;
  }

  // ---------- collisions ----------
  function blocked(x, z, r = 0.32) {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return true;
    for (const w of WALLS) if (x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r) return true;
    return false;
  }
  function stepFrom(pos, dx, dz) {
    if (!blocked(pos.x + dx, pos.z + dz)) { pos.x += dx; pos.z += dz; return true; }
    if (!blocked(pos.x + dx, pos.z)) { pos.x += dx; return true; }
    if (!blocked(pos.x, pos.z + dz)) { pos.z += dz; return true; }
    return false;
  }

  // ---------- hospital life (only on this screen) ----------
  const LINES = {
    relative: ['Ɛte sɛn?', 'Please, where is OPD?', 'Me da wo ase', 'Chale, the queue is long oo', 'Doctor, is she okay?', 'They said the folder is coming', 'I brought her NHIS card', 'Ayekoo, nurses!', 'Has the lab called her name?'],
    cleaner: ['Mind the wet floor!', 'Good morning, Doctor!', 'Ayekoo!'],
    security: ['Akwaaba!', 'Folder number, please', 'Visitors, wait at the benches', 'Ambulance coming, clear the way!'],
    vendor: ['Pure water! Pure water!', 'Ice cold water!', 'Pure water, 50 pesewas'],
  };
  function corridorPoints() {
    const pts = [];
    Object.keys(GRID).forEach((id) => pts.push(doorOut(id)));
    GAPS.forEach((g) => [0, 1, 2].forEach((r) => pts.push(new T.Vector3(g, 0, rowZ(r) + D / 2 + G / 2))));
    return pts;
  }
  function makeNPCs() {
    const cps = corridorPoints();
    const spec = [
      { kind: 'security', at: new T.Vector3(colX(2) - 4.5, 0, ROAD_Z + 4.6), looks: { top: 0x1F2D44, bottom: 0x1F2D44, hair: 'low', vneck: false }, fixed: true },
      { kind: 'security', at: new T.Vector3(colX(0) + 5.5, 0, ROAD_Z + 4.4), looks: { top: 0x1F2D44, bottom: 0x1F2D44, hair: 'low', vneck: false }, fixed: true },
      { kind: 'vendor', at: new T.Vector3(colX(3) - 2, 0, ROAD_Z + 4.8), looks: { skirt: true, topMat: KENTE[1], skirtMat: KENTE[1], bottom: 0x3A2A1A, hair: 'wrap', wrapMat: KENTE[2], basin: true }, fixed: true },
      { kind: 'cleaner', looks: { top: 0x2E9E5B, bottom: 0x2E9E5B, hair: 'wrap', wrapMat: mat(0x2E9E5B), mop: true } },
      { kind: 'cleaner', looks: { top: 0x2E9E5B, bottom: 0x2E9E5B, hair: 'low', mop: true } },
      { kind: 'relative', looks: { skirt: true, topMat: KENTE[0], skirtMat: KENTE[0], bottom: 0x3A2A1A, hair: 'wrap', wrapMat: KENTE[0] } },
      { kind: 'relative', looks: { top: 0xF4F6F8, bottom: 0x2F3E4E, hair: 'low' } },
      { kind: 'relative', looks: { skirt: true, topMat: KENTE[2], skirtMat: KENTE[2], bottom: 0x3A2A1A, hair: 'bun' } },
      { kind: 'relative', looks: { top: 0xD35400, bottom: 0x23303B, hair: 'low' } },
      { kind: 'relative', pair: 1, at: new T.Vector3(colX(1) - 2.2, 0, rowZ(0) + D / 2 + G / 2), looks: { topMat: KENTE[1], bottom: 0x23303B, hair: 'low' }, fixed: true },
      { kind: 'relative', pair: 1, at: new T.Vector3(colX(1) - 0.9, 0, rowZ(0) + D / 2 + G / 2), looks: { skirt: true, topMat: KENTE[2], skirtMat: KENTE[2], bottom: 0x3A2A1A, hair: 'wrap', wrapMat: KENTE[1] }, fixed: true },
    ];
    spec.forEach((s, i) => {
      const h = makeHuman({ skin: SKIN[i % SKIN.length], ...s.looks }); h.mopper = !!s.looks.mop;
      const pos = s.at ? s.at.clone() : cps[i % cps.length].clone();
      h.root.position.copy(pos); scene.add(h.root);
      npcs.push({ h, kind: s.kind, fixed: !!s.fixed, pair: s.pair, path: [], wait: 2 + Math.random() * 6, nextLine: 4 + Math.random() * 18, cps });
    });
    // the talking pair faces each other
    const pr = npcs.filter((n) => n.pair); if (pr.length === 2) { pr[0].h.root.rotation.y = Math.PI / 2; pr[1].h.root.rotation.y = -Math.PI / 2; }
    npcs.filter((n) => n.kind === 'security' || n.kind === 'vendor').forEach((n) => { n.h.root.rotation.y = 0; });
  }
  function updateNPC(n, dt, t) {
    const g = n.h.root;
    let moving = false;
    if (!n.fixed) {
      if (n.path.length) {
        const nx = n.path[0]; const dx = nx.x - g.position.x; const dz = nx.z - g.position.z; const d = Math.hypot(dx, dz);
        const sp = (n.kind === 'cleaner' ? 1.6 : 2.4) * dt;
        if (d <= sp) { g.position.set(nx.x, 0, nx.z); n.path.shift(); } else { g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = Math.atan2(dx, dz); moving = true; }
      } else if ((n.wait -= dt) <= 0) {
        n.path = corridorRoute(g.position, n.cps[Math.floor(Math.random() * n.cps.length)]);
        n.wait = 3 + Math.random() * 8;
      }
    }
    if ((n.nextLine -= dt) <= 0) {
      const lines = LINES[n.kind]; say(n.h, lines[Math.floor(Math.random() * lines.length)], 4);
      n.nextLine = (n.pair ? 9 : 16) + Math.random() * 20;
      if (n.pair) { const other = npcs.find((o) => o.pair === n.pair && o !== n); if (other) other.nextLine = Math.max(other.nextLine, 4.5); }
    }
    animateHuman(n.h, dt, moving, t);
  }

  // ---------- ambulances ----------
  function makeAmbulance() {
    const g = new T.Group();
    g.add(mesh('box', mat(0xFFFFFF, { roughness: 0.4 }), 3.4, 1.9, 2.0, 0.5, 1.35, 0));
    g.add(mesh('box', mat(0xFFFFFF, { roughness: 0.4 }), 1.4, 1.4, 1.9, -1.9, 1.1, 0));
    g.add(mesh('box', mat(0x9FC4D8, { metalness: 0.4, roughness: 0.2 }), 0.08, 0.6, 1.7, -2.62, 1.45, 0));
    g.add(mesh('box', mat(0xD7263D), 4.85, 0.28, 2.04, -0.2, 1.0, 0, false));
    g.add(mesh('box', mat(0x1E9E4B), 4.85, 0.12, 2.05, -0.2, 0.8, 0, false));
    const cross = new T.Group(); cross.position.set(0.5, 2.33, 0);
    cross.add(mesh('box', mat(0xD7263D), 0.9, 0.04, 0.3, 0, 0, 0, false), mesh('box', mat(0xD7263D), 0.3, 0.04, 0.9, 0, 0, 0, false));
    g.add(cross);
    const red = new T.MeshStandardMaterial({ color: 0x7A0F1A, emissive: 0xFF1E36, emissiveIntensity: 0 });
    const blue = new T.MeshStandardMaterial({ color: 0x0F2A6B, emissive: 0x2E7BFF, emissiveIntensity: 0 });
    g.add(mesh('box', red, 0.3, 0.2, 0.7, -1.7, 1.9, -0.45, false), mesh('box', blue, 0.3, 0.2, 0.7, -1.7, 1.9, 0.45, false));
    [[-1.7, 0.95], [-1.7, -0.95], [1.3, 0.95], [1.3, -0.95]].forEach(([x, z]) => { const w = mesh('wheel', mat(0x1C2228), 1, 1, 1, x, 0.42, z); w.rotation.x = Math.PI / 2; g.add(w); });
    scene.add(g);
    return { g, red, blue, siren: false };
  }
  const BAY = RECT.ambulance;
  const BAY_SLOTS = [0, 1, 2].map((i) => new T.Vector3(BAY.x - 3 + i * 3, 0, BAY.z - 0.6));
  const FAR_X = 70;
  function placeAmbulance(a, p, slot) {
    const park = BAY_SLOTS[slot % 3]; const g = a.g;
    if (p < 0.82) { const k = p / 0.82; g.position.set(FAR_X + (park.x - FAR_X) * k, 0, ROAD_Z + 1.4); g.rotation.y = 0; }
    else { const k = (p - 0.82) / 0.18; g.position.set(park.x, 0, ROAD_Z + 1.4 + (park.z - ROAD_Z - 1.4) * k); g.rotation.y = Math.PI / 2; }
    g.visible = g.position.x < FAR_X - 2;
  }

  // ---------- update from server state ----------
  function update(st, meIn, myDeptIn) {
    if (!renderer) return;
    me = meIn; myDept = myDeptIn;
    const byRoom = {};
    st.patients.forEach((p) => { if (!HIDDEN.includes(p.stage) && RECT[p.loc]) (byRoom[p.loc] = byRoom[p.loc] || []).push(p); });

    Object.keys(RECT).forEach((id) => {
      const n = (byRoom[id] || []).length; const name = window.World3D._names[id] || id;
      setSpriteText(roomLabels[id], n ? `${name}\n${n} patient${n > 1 ? 's' : ''}` : name);
      roomFloors[id].material.emissive.setHex(id === myDept ? 0x0E7C7B : 0x000000);
      roomFloors[id].material.emissiveIntensity = id === myDept ? 0.18 : 0;
    });

    Object.keys(RECT).forEach((id) => {
      const list = (byRoom[id] || []).slice().sort((a, b) => (a.bed || 0) - (b.bed || 0) || a.pid.localeCompare(b.pid));
      const bedList = slots[id] || []; const keep = new Set(list.map((p) => p.pid));
      bedList.forEach((s) => { if (s.pid && !keep.has(s.pid)) s.pid = null; });
      const placed = new Set(bedList.filter((s) => s.pid).map((s) => s.pid));
      list.forEach((p) => { if (!placed.has(p.pid)) { const free = bedList.find((s) => !s.pid); if (free) { free.pid = p.pid; placed.add(p.pid); } } });
      bedList.forEach((s) => {
        const p = s.pid && list.find((x) => x.pid === s.pid);
        s.blanket.visible = s.head.visible = s.body.visible = !!p;
        if (p) { s.blanketMat.color.setHex(TRI[p.tri] || 0x9AA9B2); s.low = p.stab < 30; s.head.material = mat(SKIN[hash(p.pid) % SKIN.length]); } else s.low = false;
      });
      const rest = list.filter((p) => !placed.has(p.pid)); const pool = standers[id];
      while (pool.length < Math.min(rest.length, 6)) { const h = makeHuman({ skin: SKIN[pool.length % 5], top: 0x9EC4D6, bottom: 0x9EC4D6, hair: 'low' }); scene.add(h.root); pool.push(h); }
      pool.forEach((h, i) => {
        const p = rest[i]; h.root.visible = !!p; if (!p) return;
        const r = RECT[id];
        const pos = id === 'ambulance' ? new T.Vector3(r.x + 3.6, 0, r.z + 2.2 - i * 0.9) : new T.Vector3(r.x - r.w / 2 + 1.2 + (i % 4) * 1.1, 0, r.z + r.d / 2 - 1 - Math.floor(i / 4) * 1.1);
        h.root.position.copy(pos); h.root.rotation.y = Math.PI; h.patient = p;
      });
    });

    const seen = new Set();
    st.players.slice(0, 120).forEach((p) => {
      seen.add(p.uid);
      let a = avatars.get(p.uid);
      if (!a) { a = avatarFor(p); avatars.set(p.uid, a); }
      a.isMe = p.uid === me?.uid;
      const dept = a.isMe ? myDept : p.dept;
      if (!RECT[dept]) return;
      if (a.dept !== dept) {
        const firstTime = !a.dept;
        if (a.isMe) {
          if (firstTime) a.h.root.position.copy(spotIn(dept, p.uid));
          else if (!a.selfWalked) ctl.auto = routeTo(a.h.root.position, dept, spotIn(dept, p.uid));
          a.selfWalked = false;
        } else if (!a.hasPos || performance.now() - a.posAt > 4000) {
          a.hasPos = false; const dest = spotIn(dept, p.uid);
          if (firstTime) a.h.root.position.copy(dest); else a.path = routeTo(a.h.root.position, dept, dest);
        }
        a.dept = dept;
      }
      a.label.visible = a.isMe || st.players.length <= 40;
    });
    avatars.forEach((a, uid) => { if (!seen.has(uid)) { scene.remove(a.h.root); avatars.delete(uid); } });

    const want = new Map();
    (st.fleet || []).forEach((u, i) => {
      let p = 1; let siren = false;
      if (u.status === 'out' || u.status === 'transfer') { p = Math.max(0, u.left / u.total); siren = true; }
      if (u.status === 'back') p = 1 - u.left / u.total;
      want.set(`u${i}`, { p, siren, slot: i });
    });
    let extra = 0;
    st.patients.forEach((p) => { if (p.stage === 'en_route' && extra < 3) { want.set(`p${p.pid}`, { p: 1 - p.eta / Math.max(1, p.eta_total), siren: true, slot: (st.fleet || []).length ? 1 + extra : extra }); extra++; } });
    if (!(st.fleet || []).length) st.patients.filter((p) => p.loc === 'ambulance' && ['arrived', 'transfer'].includes(p.stage)).slice(0, 3).forEach((p, i) => want.set(`p${p.pid}`, { p: 1, siren: false, slot: i }));
    want.forEach((w, key) => { let a = ambs.get(key); if (!a) { a = makeAmbulance(); ambs.set(key, a); } a.target = w.p; if (a.p === undefined) a.p = w.p; a.siren = w.siren; a.slot = w.slot; });
    ambs.forEach((a, key) => { if (!want.has(key)) { scene.remove(a.g); ambs.delete(key); } });

    const evDept = st.session ? st.session.dept : st.next && st.next.round_ward;
    eventMarker.visible = !!(evDept && RECT[evDept]);
    if (eventMarker.visible) eventMarker.position.set(RECT[evDept].x + RECT[evDept].w / 2 - 1.2, 5.2, RECT[evDept].z - RECT[evDept].d / 2 + 1);
    applyLighting(st);
  }

  function positions(list) {
    list.forEach(([uid, x, z, ry, m]) => {
      const a = avatars.get(uid); if (!a || a.isMe) return;
      a.hasPos = true; a.posAt = performance.now(); a.path = []; a.target = { x, z, ry, m };
      if (!a.placed) { a.h.root.position.set(x, 0, z); a.placed = true; }
    });
  }

  function applyLighting(st) {
    const d = new Date(st.now * 1000); const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    const day = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    const dusk = Math.max(0, 1 - Math.abs(h - 18.3) / 1.4) + Math.max(0, 1 - Math.abs(h - 6) / 1.2);
    const sky = new T.Color(0x0B1630).lerp(new T.Color(0x9CCBE8), day).lerp(new T.Color(0xF29E5C), Math.min(0.5, dusk * 0.5));
    const cut = st.power ? 0.45 : 1;
    scene.background = sky; scene.fog.color.copy(sky);
    sun.intensity = (0.25 + 0.95 * day) * cut;
    sun.position.set(Math.cos(((h - 6) / 12) * Math.PI) * 60, 30 + day * 50, 30);
    hemi.intensity = (0.4 + 0.45 * day) * cut; hemi.color.setHex(st.power ? 0xFFB3A0 : 0xFFFFFF);
    lamps.forEach((l) => { l.material.emissiveIntensity = (1 - day) * 1.4; });
  }

  // ---------- my character ----------
  function myAvatar() { for (const a of avatars.values()) if (a.isMe) return a; return null; }
  function driveMe(a, dt) {
    const g = a.h.root; let moving = false;
    let jx = ctl.jx; let jy = ctl.jy;
    if (ctl.keys.w || ctl.keys.arrowup) jy = 1; if (ctl.keys.s || ctl.keys.arrowdown) jy = -1;
    if (ctl.keys.a || ctl.keys.arrowleft) jx = -1; if (ctl.keys.d || ctl.keys.arrowright) jx = 1;
    const mag = Math.min(1, Math.hypot(jx, jy));
    if (mag > 0.12) {
      ctl.auto = [];
      const fx = -Math.sin(cam.yaw); const fz = -Math.cos(cam.yaw); const rx = Math.cos(cam.yaw); const rz = -Math.sin(cam.yaw);
      let dx = fx * jy + rx * jx; let dz = fz * jy + rz * jx; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const sp = 5.5 * mag * dt;
      if (stepFrom(g.position, dx * sp, dz * sp)) moving = true;
      const want = Math.atan2(dx, dz); g.rotation.y += angleDiff(want, g.rotation.y) * Math.min(1, dt * 12);
      if (cam.mode === 'walk' && jy > 0.3) cam.yaw += angleDiff(g.rotation.y + Math.PI, cam.yaw) * Math.min(1, dt * 1.2);
    } else if (ctl.auto.length) {
      const nx = ctl.auto[0]; const dx = nx.x - g.position.x; const dz = nx.z - g.position.z; const d = Math.hypot(dx, dz); const sp = 6.5 * dt;
      if (d <= sp) { g.position.set(nx.x, 0, nx.z); ctl.auto.shift(); } else { g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = Math.atan2(dx, dz); moving = true; }
    }
    if (moving) {
      const room = roomAt(g.position.x, g.position.z, 0.6);
      if (room && room !== myDept && !ctl.auto.length) { a.selfWalked = true; a.dept = room; myDept = room; if (onRoom) onRoom(room); }
    }
    const now = performance.now();
    if (now - ctl.lastSend > 200 && sendFn) {
      const key = `${g.position.x.toFixed(1)},${g.position.z.toFixed(1)},${moving}`;
      if (key !== ctl.sent) { ctl.sent = key; ctl.lastSend = now; sendFn({ a: 'pos', x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2), ry: +(((g.rotation.y % 6.283) + 6.283) % 6.283 - 3.14).toFixed(2), m: moving ? 1 : 0 }); }
    }
    return moving;
  }
  const angleDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  // ---------- animation loop ----------
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { lastT = now; return; }
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now; clock += dt; const t = clock;

    avatars.forEach((a) => {
      const g = a.h.root; let moving = false;
      if (a.isMe) moving = driveMe(a, dt);
      else if (a.hasPos && a.target) {
        const dx = a.target.x - g.position.x; const dz = a.target.z - g.position.z; const d = Math.hypot(dx, dz);
        if (d > 6) g.position.set(a.target.x, 0, a.target.z);
        else if (d > 0.04) { const sp = Math.min(d, 7 * dt); g.position.x += dx / d * sp; g.position.z += dz / d * sp; moving = true; }
        g.rotation.y += angleDiff(a.target.ry, g.rotation.y) * Math.min(1, dt * 10);
        moving = moving || !!a.target.m;
      } else if (a.path.length) {
        const nx = a.path[0]; const dx = nx.x - g.position.x; const dz = nx.z - g.position.z; const d = Math.hypot(dx, dz); const sp = 6.5 * dt;
        if (d <= sp) { g.position.set(nx.x, 0, nx.z); a.path.shift(); } else { g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = Math.atan2(dx, dz); moving = true; }
      }
      animateHuman(a.h, dt, moving, t);
      const k = cam.mode === 'walk' ? 1 : 1.9;
      a.label.scale.set(4.2 * k, 1.05 * k, 1); a.label.position.y = cam.mode === 'walk' ? 2.75 : 3.1;
      if (a.h.bubble) { a.h.bubble.scale.set(4.4 * k, 2.2 * k, 1); a.h.bubble.position.y = cam.mode === 'walk' ? 3.65 : 4.9; }
      if (a.isMe) {
        meRing.visible = true; meRing.position.set(g.position.x, 0.18, g.position.z); meRing.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
        if (cam.mode === 'walk') cam.target.lerp(new T.Vector3(g.position.x, 1.4, g.position.z), Math.min(1, dt * 8));
      }
    });
    npcs.forEach((n) => { updateNPC(n, dt, t); if (n.h.bubble) { const k = cam.mode === 'walk' ? 1 : 1.9; n.h.bubble.scale.set(4.4 * k, 2.2 * k, 1); n.h.bubble.position.y = cam.mode === 'walk' ? 3.65 : 4.9; } });
    Object.values(standers).forEach((pool) => pool.forEach((h) => { if (h.root.visible) animateHuman(h, dt, false, t); }));

    Object.values(slots).forEach((list) => list.forEach((s) => { s.blanketMat.emissive.setHex(s.low ? 0xFF0000 : 0x000000); s.blanketMat.emissiveIntensity = s.low ? 0.35 + Math.sin(t * 8) * 0.35 : 0; }));
    ambs.forEach((a) => {
      a.p += (a.target - a.p) * Math.min(1, dt * 1.5); placeAmbulance(a, a.p, a.slot);
      const on = a.siren && Math.floor(t * 5) % 2 === 0;
      a.red.emissiveIntensity = a.siren ? (on ? 2.2 : 0.1) : 0; a.blue.emissiveIntensity = a.siren ? (on ? 0.1 : 2.2) : 0;
    });
    eventMarker.position.y = 5.2 + Math.sin(t * 3) * 0.35; eventMarker.rotation.y += dt * 1.5;
    placeCamera(dt);
    renderer.render(scene, camera);
  }

  function placeCamera() {
    const walk = cam.mode === 'walk';
    const dist = walk ? cam.walkDist : cam.dist; const pitch = walk ? cam.walkPitch : cam.pitch;
    const c = Math.cos(pitch); const tg = cam.target;
    camera.position.set(tg.x + dist * c * Math.sin(cam.yaw), tg.y + dist * Math.sin(pitch), tg.z + dist * c * Math.cos(cam.yaw));
    camera.lookAt(tg.x, tg.y + (walk ? 0.6 : 0), tg.z);
  }
  cam.walkDist = 9; cam.walkPitch = 0.36;

  // ---------- input ----------
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
        cam.yaw -= dx * 0.006;
        if (cam.mode === 'walk') cam.walkPitch = Math.min(1.1, Math.max(0.12, cam.walkPitch + dy * 0.003));
        else cam.pitch = Math.min(1.42, Math.max(0.32, cam.pitch + dy * 0.004));
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoom(pinch / d);
        pinch = d; if (down) down.moved = 99;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size === 0 && down && down.moved < 8) tap(e); if (pts.size === 0) down = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); down = null; });
    el.addEventListener('wheel', (e) => { e.preventDefault(); zoom(1 + Math.sign(e.deltaY) * 0.1); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (cam.mode !== 'walk' || /input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
      const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { ctl.keys[k] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { ctl.keys[e.key.toLowerCase()] = false; });
  }
  function zoom(f) {
    if (cam.mode === 'walk') cam.walkDist = Math.min(26, Math.max(4, cam.walkDist * f));
    else cam.dist = Math.min(130, Math.max(16, cam.dist * f));
  }
  function bindJoystick(base, knob) {
    let id = null; let cx = 0; let cy = 0; const R = 48;
    const set = (x, y) => { const dx = x - cx; const dy = y - cy; const l = Math.min(R, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx);
      const kx = Math.cos(a) * l; const ky = Math.sin(a) * l; knob.style.transform = `translate(${kx}px, ${ky}px)`; ctl.jx = kx / R; ctl.jy = -ky / R; };
    base.addEventListener('pointerdown', (e) => { e.stopPropagation(); id = e.pointerId; base.setPointerCapture(id); const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e.clientX, e.clientY); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; ctl.jx = 0; ctl.jy = 0; knob.style.transform = ''; };
    base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
  }
  function tap(e) {
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
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
    supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (_) { return false; } },
    init(el, cfg, onRoomCb, send) {
      if (renderer) return true;
      if (!this.supported()) return false;
      container = el; onRoom = onRoomCb; sendFn = send;
      Object.entries(cfg.depts).forEach(([k, v]) => { this._names[k] = v.name; });
      const small = Math.min(window.innerWidth, window.innerHeight) < 500;
      renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
      renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = small ? T.PCFShadowMap : T.PCFSoftShadowMap;
      el.prepend(renderer.domElement);
      scene = new T.Scene(); scene.fog = new T.Fog(0x9CCBE8, 110, 240);
      camera = new T.PerspectiveCamera(45, 1, 0.3, 600);
      hemi = new T.HemisphereLight(0xFFFFFF, 0x5B6B4A, 0.75); scene.add(hemi);
      sun = new T.DirectionalLight(0xFFF4E0, 1); sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536);
      Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
      sun.target.position.set(0, 0, rowZ(1)); scene.add(sun, sun.target);
      raycaster = new T.Raycaster();
      buildWorld(); makeNPCs(); bindInput(renderer.domElement);
      const joy = el.querySelector('.joy'); if (joy) bindJoystick(joy, joy.querySelector('.joy-knob'));
      new ResizeObserver(resize).observe(el); resize();
      running = true; requestAnimationFrame(frame);
      return true;
    },
    update,
    positions,
    say(name, text) { for (const a of avatars.values()) if (a.name === name) { say(a.h, text, Math.min(9, 3 + text.length / 12)); break; } },
    setVisible(v) { visible = v; if (v) resize(); },
    setMode(mode) {
      cam.mode = mode;
      const a = myAvatar();
      if (mode === 'walk' && a) { cam.target.set(a.h.root.position.x, 1.4, a.h.root.position.z); cam.yaw = a.h.root.rotation.y + Math.PI; }
      if (mode !== 'walk') { Object.assign(cam, { yaw: 0.55, pitch: 0.92, dist: 68 }); cam.target.set(0, 0, rowZ(1) + 3); Object.keys(ctl.keys).forEach((k) => { ctl.keys[k] = false; }); ctl.jx = ctl.jy = 0; }
      Object.values(roomLabels).forEach((l) => { l.visible = mode !== 'walk'; });
    },
    zoom,
    reset() { Object.assign(cam, { yaw: 0.55, pitch: 0.92, dist: 68 }); cam.walkDist = 9; cam.walkPitch = 0.36; if (cam.mode !== 'walk') cam.target.set(0, 0, rowZ(1) + 3); },
  };
})();
