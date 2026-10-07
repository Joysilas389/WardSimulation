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
    pharmacy: [2, 1], theatre: [3, 1], maternity: [0, 2], paeds: [1, 2], medical: [2, 2], surgical: [3, 2],
    canteen: [4, 0], oncall: [4, 1], washroom: [4, 2] };
  const STAFF_ROOMS = ['canteen', 'oncall', 'washroom'];
  const STAFF_NAMES = { canteen: 'Staff canteen', oncall: 'On-call room', washroom: 'Staff washroom' };
  const RECT = {};
  Object.entries(GRID).forEach(([id, [c, r]]) => { RECT[id] = { x: colX(c), z: rowZ(r), w: W, d: D }; });
  RECT.conference = { x: 0, z: rowZ(2) + D / 2 + G + 3.2, w: 4 * W + 3 * G, d: 6.4 };
  const ROAD_Z = rowZ(0) - D / 2 - G - 3;
  // The other facilities in the network sit north of the main road, each on its own branch road.
  const W2 = 9; const D2 = 7;
  const FACS = {
    ndh: { name: 'Nkwanta District Hospital', short: 'Nkwanta', x: -104, z: -58, rooms: ['ndh_casualty', 'ndh_ward', 'ndh_mat', 'ndh_lab'] },
    apc: { name: 'Asafo Polyclinic', short: 'Asafo', x: 12, z: -76, rooms: ['apc_opd', 'apc_mat', 'apc_lab'] },
    och: { name: 'Odumase CHPS Compound', short: 'Odumase', x: 108, z: -50, rooms: ['och_room', 'och_mat'] },
  };
  const FAC_OF = {};
  Object.entries(FACS).forEach(([f, F]) => {
    F.rooms.forEach((id, i) => { RECT[id] = { x: F.x + (i - (F.rooms.length - 1) / 2) * (W2 + G), z: F.z, w: W2, d: D2 }; FAC_OF[id] = f; });
    F.w = F.rooms.length * (W2 + G) + 4;
    F.gate = new T.Vector3(F.x, 0, F.z + D2 / 2 + G + 1.6);
  });
  const facOfRoom = (id) => FAC_OF[id] || 'akt';
  const ROAD_X = 200;
  const GAPS = [0, 1, 2, 3].map((c) => colX(c) + W / 2 + G / 2);
  const SLAB_X0 = colX(0) - W / 2 - 3; const SLAB_X1 = colX(4) + W / 2 + 3;
  const BEDS = { emergency: 6, opd: 4, maternity: 6, paeds: 6, medical: 8, surgical: 8, theatre: 1,
    ndh_casualty: 4, ndh_ward: 6, ndh_mat: 3, apc_opd: 2, apc_mat: 2, och_room: 2, och_mat: 1 };
  const FLOOR = { ambulance: 0x8A949C, emergency: 0xE9F1F2, radiology: 0xE4E8F0, lab: 0xEEF2F0, records: 0xEFE8DA, opd: 0xE7EEF1,
    pharmacy: 0xE9F2E6, theatre: 0xCFE7DD, maternity: 0xF4E4EA, paeds: 0xF6EDCF, medical: 0xEFEBE2, surgical: 0xE8ECE6, conference: 0xC9A47A,
    canteen: 0xF1DFC0, oncall: 0xD9E0EC, washroom: 0xDDEDF3,
    ndh_casualty: 0xE9F1F2, ndh_ward: 0xEFEBE2, ndh_mat: 0xF4E4EA, ndh_lab: 0xEEF2F0, apc_opd: 0xE7EEF1, apc_mat: 0xF4E4EA, apc_lab: 0xEEF2F0,
    och_room: 0xF3EBDD, och_mat: 0xF4E4EA };
  const ROLE_COL = { doctor: 0x1E5AA8, student: 0x5B6CF0, nurse: 0x0E7C7B, midwife: 0x8E44AD, pharmacist: 0x2E7D32,
    lab_scientist: 0xB4532A, radiographer: 0x4F5D75, paramedic: 0xA4161A };
  const TRI = { red: 0xD7263D, orange: 0xEE7B06, yellow: 0xE9B824, green: 0x2E9E5B };
  const SKIN = [0x5A3825, 0x6B4423, 0x4A2C1D, 0x7A4E2D, 0x3D2416];
  const HIDDEN = ['en_route', 'awaiting_ambulance', 'pickup', 'leaving'];

  const WALLS = [];
  const BOUNDS = { x0: -ROAD_X + 5, x1: ROAD_X - 5, z0: -100, z1: RECT.conference.z + 13 };
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

  const interactables = []; const SEATS = []; const BUNKS = []; const wallMeshes = [];
  const HIT_MAT = new T.MeshBasicMaterial({ visible: false });
  function addHit(g, kind, name, x, y, z, sx, sy, sz, info = {}) {
    const m = new T.Mesh(GEO.box, HIT_MAT); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.userData.dyn = true;
    m.userData.inter = { kind, name, ...info };
    g.add(m); interactables.push(m); return m;
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
    scene.add(mesh('box', mat(0x7FA35B), ROAD_X * 2 + 160, 0.2, 360, 0, -0.12, -40, false));            // grass
    scene.add(mesh('box', mat(0xC9D3D6), SLAB_X1 - SLAB_X0, 0.1, RECT.conference.z + 6 - ROAD_Z + 2, (SLAB_X0 + SLAB_X1) / 2, -0.02,
      (ROAD_Z + 3 + RECT.conference.z + RECT.conference.d / 2 + 2) / 2, false));                       // hospital slab
    // road with dashes and kerbs
    scene.add(mesh('box', mat(0x3B4652), ROAD_X * 2, 0.06, 6, 0, 0.02, ROAD_Z, false));
    for (let x = -ROAD_X; x < ROAD_X; x += 6) scene.add(mesh('box', mat(0xE9D27A), 2.6, 0.02, 0.22, x, 0.07, ROAD_Z, false));
    [ROAD_Z - 3.1, ROAD_Z + 3.1].forEach((z) => scene.add(mesh('box', mat(0xD9DDE0), ROAD_X * 2, 0.2, 0.25, 0, 0.1, z)));
    Object.values(FACS).forEach((F) => {
      const len = (ROAD_Z - 3) - F.gate.z;
      scene.add(mesh('box', mat(0x3B4652), 5, 0.07, len, F.x, 0.025, F.gate.z + len / 2, false));
      for (let z = F.gate.z + 3; z < ROAD_Z - 4; z += 6) scene.add(mesh('box', mat(0xE9D27A), 0.22, 0.02, 2.6, F.x, 0.08, z, false));
      scene.add(mesh('box', mat(0xC9D3D6), F.w, 0.1, D2 + G + 6, F.x, -0.02, F.z + G / 2 + 1, false));
      [-1, 1].forEach((s) => scene.add(mesh('box', mat(0x23303B), 0.3, 2.4, 0.3, F.x + s * 3.4, 1.2, F.gate.z + 1.4)));
      scene.add(mesh('box', mat(0x1E7A3A), 7.2, 1.0, 0.25, F.x, 2.4, F.gate.z + 1.4));
      const s = textSprite(F.name, { w: 12, size: 40 }); s.position.set(F.x, 5.2, F.z - D2 / 2 - 0.5); scene.add(s);
    });

    Object.keys(RECT).forEach(buildRoom);
    buildSign(); buildTrees(); buildCarPark(); buildLamps();

    meRing = new T.Mesh(new T.TorusGeometry(0.75, 0.09, 8, 28), mat(0x0E7C7B, { emissive: 0x0E7C7B, emissiveIntensity: 0.8 }));
    meRing.rotation.x = Math.PI / 2; meRing.visible = false; meRing.userData.dyn = true; scene.add(meRing);
    eventMarker = new T.Group();
    const cone = mesh('cone', mat(0xE9B824, { emissive: 0xE9B824, emissiveIntensity: 0.5 }), 1.1, 1.4, 1.1, 0, 0, 0);
    cone.rotation.x = Math.PI; eventMarker.add(cone); eventMarker.visible = false; eventMarker.userData.dyn = true; scene.add(eventMarker);
    mergeStatic();
    groundHit = new T.Mesh(new T.PlaneGeometry(400, 400), HIT_MAT); groundHit.rotation.x = -Math.PI / 2; groundHit.position.y = 0.03; groundHit.userData.dyn = true; scene.add(groundHit);
    tapMarker = new T.Mesh(new T.TorusGeometry(0.5, 0.07, 6, 24), new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.85 }));
    tapMarker.rotation.x = -Math.PI / 2; tapMarker.visible = false; scene.add(tapMarker);
    moodCross = new T.Group();
    [[0.16, 0.5, 0.16], [0.5, 0.16, 0.16]].forEach(([x, y, z]) => {
      const m = new T.Mesh(GEO.box, new T.MeshStandardMaterial({ color: 0x2E9E5B, emissive: 0x2E9E5B, emissiveIntensity: 0.6 }));
      m.scale.set(x, y, z); moodCross.add(m);
    });
    moodCross.visible = false; scene.add(moodCross);
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
      if (material === mat(0xF6F3EC) || material === mat(0x0E7C7B)) wallMeshes.push(merged);
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
    const label = textSprite(window.World3D._names[id] || STAFF_NAMES[id] || id, { w: id === 'conference' ? 10 : 8 });
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
    const slot = { group: b, blanket, blanketMat, head, body, pid: null };
    const wx = g.position.x + x; const wz = g.position.z + z;
    slot.hit = addHit(g, 'bed', table ? 'Operating table' : 'Bed', x, 0.9, z, 1.4, 1.6, 2.5,
      { slot, stand: new T.Vector3(wx + 1.15, 0, wz + 0.2), face: new T.Vector3(wx, 0, wz) });
    return slot;
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
    if (id === 'lab') addHit(g, 'lab', 'Lab bench', 0, 0.8, -2.4, r.w - 2, 1.6, 1.4, { site: 'lab', stand: new T.Vector3(r.x, 0, r.z - 1.2), face: new T.Vector3(r.x, 0, r.z - 2.4) });
    if (id === 'radiology') addHit(g, 'ct', 'CT scanner', -1.5, 1.2, -0.4, 3.4, 2.4, 4.4, { site: 'radiology', stand: new T.Vector3(r.x + 0.6, 0, r.z + 0.4), face: new T.Vector3(r.x - 1.5, 0, r.z - 0.4) });
    if (id.endsWith('_lab')) {
      add('box', mat(0xF0F0F0), r.w - 2, 1.0, 1.0, 0, 0.5, -r.d / 2 + 0.9); add('box', mat(0x23303B), r.w - 2, 0.08, 1.05, 0, 1.04, -r.d / 2 + 0.9);
      for (let i = 0; i < 3; i++) add('cyl', mat([0xD7263D, 0xE9B824, 0x1E5AA8][i]), 0.12, 0.5, 0.12, -2 + i * 1.6, 1.33, -r.d / 2 + 0.9);
      add('box', mat(0x9AA5AE), 0.7, 0.8, 0.6, 2.6, 1.45, -r.d / 2 + 0.9);
      if (id === 'ndh_lab') { add('box', mat(0xB9C3CA), 1.2, 2.2, 0.4, r.w / 2 - 1, 1.1, 1.0); add('box', mat(0x2F4858), 0.9, 0.9, 1.8, r.w / 2 - 2.6, 0.45, 1.0); }
      addHit(g, 'lab', id === 'ndh_lab' ? 'Lab bench and X-ray' : 'Lab bench', 0, 0.8, -r.d / 2 + 0.9, r.w - 2, 1.6, 1.4, { site: id, stand: new T.Vector3(r.x, 0, r.z - r.d / 2 + 2.1), face: new T.Vector3(r.x, 0, r.z - r.d / 2 + 0.9) });
    }
    if (id === 'och_room') { add('box', mat(0x8B6B4A), 2.0, 0.9, 0.9, r.w / 2 - 1.6, 0.45, r.d / 2 - 1.4); add('box', mat(0x1E5AA8), 0.8, 0.5, 0.8, -r.w / 2 + 1.2, 0.3, r.d / 2 - 1.2); }
    if (id === 'pharmacy') addHit(g, 'pharmacy', 'Dispensing counter', 0, 0.6, 0.6, r.w - 3, 1.3, 1.0, { stand: new T.Vector3(r.x, 0, r.z - 0.6), face: new T.Vector3(r.x, 0, r.z + 0.6) });
    if (id === 'records') addHit(g, 'records', 'Records desk', 0, 0.6, 0.4, 3.4, 1.2, 1.2, { stand: new T.Vector3(r.x, 0, r.z - 0.6), face: new T.Vector3(r.x, 0, r.z + 0.4) });
    if (id === 'canteen') {
      add('box', mat(0x8B6B4A), r.w - 3, 1.0, 0.9, 0, 0.5, -r.d / 2 + 0.9);
      add('box', mat(0xF4F1EA), r.w - 3, 0.06, 1.0, 0, 1.03, -r.d / 2 + 0.9);
      [[0xD9531E, -2.6], [0x6B3A2A, -1.2], [0xEDE6D3, 0.2], [0x2E9E5B, 1.6], [0x7A4E2D, 3.0]].forEach(([c, x]) => {
        add('cyl', mat(0xFFFFFF), 0.8, 0.14, 0.8, x, 1.12, -r.d / 2 + 0.9);
        add('sph', mat(c), 0.62, 0.24, 0.62, x, 1.2, -r.d / 2 + 0.9);
      });
      const menu = textSprite('Today: jollof, waakye, kenkey, red red', { w: 7.5, size: 34 });
      menu.position.set(r.x, 2.6, r.z - r.d / 2 + 0.2); scene.add(menu);
      addHit(g, 'canteen', 'Food counter', 0, 0.6, -r.d / 2 + 0.9, r.w - 3, 1.4, 1.2, { stand: new T.Vector3(r.x, 0, r.z - r.d / 2 + 2.0), face: new T.Vector3(r.x, 0, r.z - r.d / 2 + 0.9) });
      [-2.4, 2.4].forEach((tx) => {
        const tz = 1.2;
        add('cyl', mat(0xF4F1EA), 1.7, 0.08, 1.7, tx, 0.85, tz); add('cyl', mat(0x9AA5AE), 0.15, 0.85, 0.15, tx, 0.42, tz);
        [[-1.05, 0], [1.05, 0], [0, -1.05], [0, 1.05]].forEach(([dx, dz]) => {
          add('box', mat(0xD35400), 0.6, 0.08, 0.6, tx + dx, 0.5, tz + dz); add('box', mat(0x9AA5AE), 0.08, 0.5, 0.08, tx + dx, 0.25, tz + dz);
          SEATS.push({ pos: new T.Vector3(r.x + tx + dx, 0, r.z + tz + dz), face: new T.Vector3(r.x + tx, 0, r.z + tz), taken: false });
        });
        addHit(g, 'canteen', 'Canteen table', tx, 0.6, tz, 3, 1.2, 3, { stand: new T.Vector3(r.x + tx, 0, r.z + tz + 1.5), face: new T.Vector3(r.x + tx, 0, r.z + tz) });
      });
    }
    if (id === 'oncall') {
      [-2.7, 2.7].forEach((bx) => {
        const bz = -r.d / 2 + 1.3;
        [[-1.15, -0.45], [1.15, -0.45], [-1.15, 0.45], [1.15, 0.45]].forEach(([dx, dz]) => add('box', mat(0x4F5D75), 0.1, 2.4, 0.1, bx + dx, 1.2, bz + dz));
        [0.55, 1.75].forEach((y) => { add('box', mat(0x4F5D75), 2.4, 0.1, 1.0, bx, y - 0.1, bz); add('box', mat(0xF4F6F8), 2.2, 0.16, 0.9, bx, y, bz); add('box', mat(0x9EC4D6), 1.3, 0.1, 0.92, bx + 0.4, y + 0.1, bz); add('box', mat(0xFFFFFF), 0.5, 0.12, 0.6, bx - 0.8, y + 0.12, bz); });
        BUNKS.push({ pos: new T.Vector3(r.x + bx, 0, r.z + bz), taken: false });
        addHit(g, 'bunk', 'Bunk bed', bx, 1.1, bz, 2.6, 2.4, 1.2, { bunk: BUNKS[BUNKS.length - 1], stand: new T.Vector3(r.x + bx, 0, r.z + bz + 1.1), face: new T.Vector3(r.x + bx, 0, r.z + bz) });
      });
      for (let i = 0; i < 4; i++) add('box', mat([0x1E5AA8, 0x9AA5AE][i % 2]), 0.9, 2.0, 0.6, -r.w / 2 + 0.6, 1.0, -0.4 + i * 0.95);
      add('box', mat(0x23303B), 1.8, 1.0, 0.1, r.w / 2 - 0.3, 1.6, 0.8); add('box', mat(0x0B2233, { emissive: 0x2E7BFF, emissiveIntensity: 0.4 }), 1.6, 0.85, 0.02, r.w / 2 - 0.36, 1.6, 0.8);
    }
    if (id === 'washroom') {
      [-3.4, -1.4].forEach((cx, i) => {
        add('box', mat(0xB9C9D6), 0.08, 1.9, 1.8, cx + 0.95, 0.95, -r.d / 2 + 0.9);
        add('cyl', mat(0xFFFFFF), 0.55, 0.45, 0.65, cx, 0.25, -r.d / 2 + 0.75); add('box', mat(0xFFFFFF), 0.6, 0.6, 0.25, cx, 0.75, -r.d / 2 + 0.25);
        addHit(g, 'toilet', 'Toilet', cx, 0.6, -r.d / 2 + 0.8, 1.2, 1.3, 1.4, { seat: new T.Vector3(r.x + cx, 0, r.z - r.d / 2 + 0.95), stand: new T.Vector3(r.x + cx, 0, r.z - r.d / 2 + 1.9), face: new T.Vector3(r.x + cx, 0, r.z + 2) });
      });
      add('box', mat(0xB9C9D6), 0.08, 1.9, 1.8, -4.35, 0.95, -r.d / 2 + 0.9);
      [1.6, 3.4].forEach((sx) => {
        add('box', mat(0xF4F6F8), 1.2, 0.9, 0.6, sx, 0.45, -r.d / 2 + 0.45); add('cyl', mat(0xDDE6EA), 0.7, 0.1, 0.45, sx, 0.92, -r.d / 2 + 0.45);
        add('box', mat(0xBFE3F2, { emissive: 0x8FD3F0, emissiveIntensity: 0.25, roughness: 0.1 }), 1.0, 0.9, 0.04, sx, 1.75, -r.d / 2 + 0.16);
        addHit(g, 'sink', 'Sink', sx, 0.8, -r.d / 2 + 0.5, 1.3, 1.6, 1.0, { stand: new T.Vector3(r.x + sx, 0, r.z - r.d / 2 + 1.25), face: new T.Vector3(r.x + sx, 0, r.z - r.d / 2) });
      });
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
    g.add(mesh('box', mat(0x0E7C7C), 7.2, 1.2, 0.25, 0, 2.6, 0));
    const s = textSprite('Akwaaba Teaching Hospital', { w: 9, bg: 'rgba(14,124,123,0)', size: 44 });
    s.position.set(colX(2), 2.65, ROAD_Z + 4.2); scene.add(s);
  }
  function buildTrees() {
    const spots = [];
    for (let i = 0; i < 46; i++) {
      const side = i % 4; const t = rnd('tree', i);
      let x; let z;
      if (side === 0) { x = -40 - t * 30; z = -20 + rnd('tz', i) * 60; }
      else if (side === 1) { x = SLAB_X1 + 5 + t * 24; z = -20 + rnd('tz', i) * 60; }
      else if (side === 2) { x = -180 + t * 360; z = ROAD_Z - 8 - rnd('tz', i) * 80; }
      else { x = -60 + t * 120; z = RECT.conference.z + 8 + rnd('tz', i) * 18; }
      spots.push([x, z, 0.8 + rnd('ts', i) * 0.7]);
    }
    for (let i = 46; i < 120; i++) spots.push([-180 + rnd('tx2', i) * 360, ROAD_Z - 8 - rnd('tz2', i) * 85, 0.8 + rnd('ts2', i) * 0.8]);
    const clear = (x, z) => Object.values(FACS).every((F) => !(Math.abs(x - F.x) < F.w / 2 + 4 && z < F.gate.z + 4 && z > F.z - D2 / 2 - 6) && !(Math.abs(x - F.x) < 6 && z > F.gate.z && z < ROAD_Z));
    spots.forEach(([x, z, s], i) => {
      if (!clear(x, z)) return;
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
    for (let x = -190; x <= 190; x += 16) {
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
  let meRing, eventMarker, me = null, myDept = null, lastState = null, groundHit, tapMarker, moodCross, wallK = 1, hooks = {};
  const cam = { yaw: 0.55, pitch: 0.92, dist: 74, target: new T.Vector3(5, 0, rowZ(1) + 3), mode: 'overview' };
  const ctl = { jx: 0, jy: 0, keys: {}, lastSend: 0, sent: '', auto: [] };

  // ---------- people ----------
  const HAIR = [0x1A1110, 0x241812, 0x0E0B0A];
  const UNI = [null, 0x1E5AA8, 0x0E7C7B, 0x6B2D86, 0x2E7D32, 0x8B1E3F];
  // ---------- real characters: Quaternius Universal Base Characters + Animation Library (CC0) ----------
  const GLB = { ready: false, failed: false, male: null, female: null, clips: {}, count: 0 };
  const GLB_MAX = 45;          // beyond this, use the light shape-based people to keep phones smooth
  const CHAR_H = 2.05;         // character height in world units
  const PART = (name) => {
    if (/head|neck/i.test(name)) return 0;
    if (/hand|index|middle|pinky|ring|thumb/i.test(name)) return 0;
    if (/lowerarm/i.test(name)) return 4;
    if (/upperarm/i.test(name)) return 5;
    if (/foot|ball/i.test(name)) return 3;
    if (/thigh|calf|pelvis/i.test(name)) return 2;
    return 1;   // spine, clavicle: the top
  };
  function prepTemplate(gltf) {
    const scene = gltf.scene; const tpl = { scene, scale: 1, headY: 1.8, neckY: 1.6 };
    scene.traverse((n) => {
      if (!n.isSkinnedMesh) return;
      const mname = (n.material && n.material.name) || '';
      n.userData.kind = /Hair/i.test(mname) ? 'hair' : /Eye/i.test(mname) ? 'eyes' : 'body';
      if (n.userData.kind === 'body') {
        const g = n.geometry; const si = g.attributes.skinIndex; const sw = g.attributes.skinWeight;
        const part = new Float32Array(si.count);
        for (let i = 0; i < si.count; i++) {
          let best = 0; let bw = -1;
          const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)]; const is = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
          for (let k = 0; k < 4; k++) { if (ws[k] > bw) { bw = ws[k]; best = is[k]; } }
          part[i] = PART(n.skeleton.bones[best].name);
        }
        g.setAttribute('part', new T.BufferAttribute(part, 1));
      }
    });
    const box = new T.Box3().setFromObject(scene); const h = box.max.y - box.min.y;
    tpl.scale = CHAR_H / (h || 1);
    scene.updateMatrixWorld(true);
    const v = new T.Vector3();
    scene.traverse((n) => { if (n.isBone && n.name === 'Head') { n.getWorldPosition(v); tpl.headY = v.y * tpl.scale; } if (n.isBone && n.name === 'neck_01') { n.getWorldPosition(v); tpl.neckY = v.y * tpl.scale; } });
    return tpl;
  }
  function loadModels() {
    const L = window.WL_GLTF; if (!L) { GLB.failed = true; return; }
    const loader = new L.GLTFLoader(); const base = window.WARDLIFE_MODELS || 'models/';
    Promise.all(['male', 'female', 'anims'].map((n) => loader.loadAsync(`${base}${n}.glb`)))
      .then(([m, f, a]) => {
        GLB.male = prepTemplate(m); GLB.female = prepTemplate(f);
        a.animations.forEach((c) => { GLB.clips[c.name] = c; });
        GLB.ready = true; upgradeAll();
      })
      .catch((e) => { console.warn('Character models could not load; using simple characters.', e); GLB.failed = true; });
  }
  function bodyMaterial(src, o) {
    const m = src.clone();
    const top = o.topMat ? 0xFFFFFF : (o.coat ? 0xF4F6F8 : o.top);
    const u = {
      uSkin: { value: new T.Color(o.skin) }, uTop: { value: new T.Color(top) }, uBottom: { value: new T.Color(o.bottom) },
      uShoe: { value: new T.Color(o.shoes || 0x1C2228) }, uSleeves: { value: o.coat ? 1 : 0 },
      uPattern: { value: (o.topMat && o.topMat.map) || null }, uUsePattern: { value: o.topMat && o.topMat.map ? 1 : 0 },
      uPatternBottom: { value: o.skirt && o.topMat && o.topMat.map ? 1 : 0 },
    };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float part;\nvarying float vPart;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = part;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uSkin; uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uShoe; uniform float uSleeves;
uniform sampler2D uPattern; uniform float uUsePattern; uniform float uPatternBottom;
varying float vPart;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float shade = clamp(lum / 0.33, 0.62, 1.3);
  float p = floor(vPart + 0.5);
  vec3 cloth = uTop;
  #ifdef USE_UV
  if (uUsePattern > 0.5) cloth = texture2D(uPattern, vUv * 3.0).rgb;
  #endif
  vec3 bottom = uBottom;
  #ifdef USE_UV
  if (uPatternBottom > 0.5) bottom = texture2D(uPattern, vUv * 3.0).rgb;
  #endif
  vec3 col = uSkin * shade;
  if (p > 0.5 && p < 1.5) col = cloth;
  else if (p > 1.5 && p < 2.5) col = bottom;
  else if (p > 2.5 && p < 3.5) col = uShoe;
  else if (p > 3.5 && p < 4.5) col = mix(uSkin * shade, cloth, uSleeves);
  else if (p > 4.5) col = cloth;
  diffuseColor.rgb = col;
}`);
    };
    m.customProgramCacheKey = () => 'wl-body';
    return m;
  }
  function attachToBone(model, bone, obj, offset) {
    model.updateMatrixWorld(true);
    const bp = new T.Vector3(); const bq = new T.Quaternion(); const bs = new T.Vector3();
    bone.matrixWorld.decompose(bp, bq, bs);
    const inv = bq.clone().invert(); const s = 1 / (bs.x || 1);
    obj.quaternion.copy(inv); obj.scale.multiplyScalar(s);
    obj.position.copy(offset).applyQuaternion(inv).multiplyScalar(s);
    bone.add(obj);
  }
  function makeHumanGLB(o) {
    const tpl = o.female ? GLB.female : GLB.male;
    const model = window.WL_GLTF.SkeletonUtils.clone(tpl.scene);
    const root = new T.Group(); root.rotation.order = 'YXZ';
    model.scale.setScalar(tpl.scale); root.add(model);
    const bones = {};
    const hair = o.hair || 'short';
    const nativeHair = (hair === 'short' && !o.female) || (hair === 'long' && o.female);
    model.traverse((n) => {
      if (n.isBone) bones[n.name] = n;
      if (!n.isSkinnedMesh) return;
      n.frustumCulled = false; n.castShadow = false; n.receiveShadow = false;
      if (n.userData.kind === 'body') n.material = bodyMaterial(n.material, o);
      if (n.userData.kind === 'hair') {
        n.visible = nativeHair && !o.cap;
        n.material = n.material.clone(); n.material.color.set(o.hairCol ?? HAIR[0]).multiplyScalar(2.2);
      }
    });
    // head pieces, built in the character's frame then pinned to the head bone
    const head = bones.Head; const top = CHAR_H - tpl.headY; const hm = mat(o.hairCol ?? HAIR[0]);
    if (head) {
      const g = new T.Group();
      const add = (geo, m, sx, sy, sz, x, y, z) => { const p = mesh(geo, m, sx, sy, sz, x, y, z, false); g.add(p); return p; };
      const capY = top * 0.52;
      if (!nativeHair && hair !== 'bald' && hair !== 'wrap') add('hairCap', hm, 0.3, 0.3, 0.32, 0, capY - 0.02, -0.01);
      if (hair === 'bun') add('sph', hm, 0.15, 0.15, 0.15, 0, capY + 0.04, -0.14);
      if (hair === 'braids') for (let i = 0; i < 7; i++) { const b = add('cyl', hm, 0.04, 0.36, 0.04, -0.11 + i * 0.037, capY - 0.2, -0.11 + Math.abs(i - 3) * 0.01); b.rotation.x = 0.2; }
      if (hair === 'long' && !nativeHair) add('box', hm, 0.26, 0.4, 0.06, 0, capY - 0.25, -0.12);
      if (hair === 'wrap') { add('cyl', o.wrapMat || KENTE[0], 0.33, 0.16, 0.35, 0, capY + 0.02, -0.01); add('sph', o.wrapMat || KENTE[0], 0.17, 0.13, 0.17, 0.04, capY + 0.12, -0.04); }
      if (o.cap) add('cyl', mat(0xFFFFFF), 0.25, 0.08, 0.25, 0, capY + 0.08, 0.01);
      if (o.glasses) { [-1, 1].forEach((sd) => add('ring', mat(0x111111), 0.11, 0.11, 0.11, 0.045 * sd, top * 0.2, 0.125)); add('box', mat(0x111111), 0.04, 0.01, 0.01, 0, top * 0.2, 0.128); }
      if (o.basin) { add('cyl', mat(0xC0392B), 0.42, 0.12, 0.42, 0, capY + 0.12, 0); for (let i = 0; i < 5; i++) add('box', mat(0xDCEFFF), 0.1, 0.04, 0.13, -0.1 + i * 0.05, capY + 0.2, (i % 2) * 0.05 - 0.025); }
      attachToBone(model, head, g, new T.Vector3(0, 0, 0));
    }
    if (o.stetho && bones.spine_03) {
      const g = new T.Group();
      const r = mesh('ring', mat(0x23303B), 0.32, 0.32, 0.32, 0, 0, 0.03, false); r.rotation.x = Math.PI / 2 - 0.3; g.add(r);
      const d = mesh('cyl', mat(0x9AA5AE), 0.07, 0.03, 0.07, 0.05, -0.2, 0.15, false); d.rotation.x = Math.PI / 2; g.add(d);
      const sp = new T.Vector3(); model.updateMatrixWorld(true); bones.neck_01.getWorldPosition(sp);
      attachToBone(model, bones.spine_03, g, new T.Vector3(0, sp.y - (bones.spine_03.getWorldPosition(new T.Vector3()).y) - 0.08, 0));
    }
    if (o.mop && bones.hand_r) {
      const g = new T.Group();
      g.add(mesh('cyl', mat(0x8B6B4A), 0.05, 1.6, 0.05, 0, -0.5, 0.1, false)); g.add(mesh('box', mat(0x2E9E5B), 0.45, 0.1, 0.22, 0, -1.25, 0.25, false));
      attachToBone(model, bones.hand_r, g, new T.Vector3(0, 0, 0));
    }
    const mixer = new T.AnimationMixer(model);
    const blob = new T.Mesh(GEO.blob, new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.17; blob.scale.setScalar(1.1); root.add(blob);
    const hit = new T.Mesh(GEO.box, HIT_MAT); hit.scale.set(0.9, 2.3, 0.9); hit.position.y = 1.15; root.add(hit);
    if (o.sx || o.sy) root.scale.set(o.sx || 1, o.sy || 1, o.sx || 1);
    GLB.count++;
    const h = { root, model, mixer, actions: {}, hit, glb: true, talkUntil: 0, seed: Math.random() * 10, bubble: null, pose: null, cur: null };
    playClip(h, 'Idle_Loop', 0);
    if (h.curAction) h.curAction.time = Math.random() * h.curAction.getClip().duration;
    return h;
  }
  function playClip(h, name, fade = 0.25, speed = 1) {
    if (h.cur === name) { if (h.curAction) h.curAction.timeScale = speed; return; }
    const clip = GLB.clips[name]; if (!clip) return;
    const a = h.actions[name] || (h.actions[name] = h.mixer.clipAction(clip));
    a.reset(); a.timeScale = speed; a.setEffectiveWeight(1); a.play();
    if (h.curAction && fade > 0) { a.fadeIn(fade); h.curAction.fadeOut(fade); } else if (h.curAction) h.curAction.stop();
    h.curAction = a; h.cur = name;
  }
  function animateGLB(h, dt, moving, t) {
    const talking = t < h.talkUntil; const pose = h.pose;
    let clip = 'Idle_Loop'; let sp = 1;
    if (pose === 'sit') clip = talking ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop';
    else if (pose === 'eat') clip = 'Sitting_Talking_Loop';
    else if (pose === 'bend' || pose === 'wash') clip = 'Interact';
    else if (pose === 'wave') clip = 'Idle_Talking_Loop';
    else if (pose === 'lie') clip = 'Idle_Loop';
    else if (moving) { clip = h.mopper ? 'Push_Loop' : 'Walk_Loop'; sp = h.walkRate || 1.8; }
    else if (talking) clip = 'Idle_Talking_Loop';
    playClip(h, clip, 0.25, sp);
    h.mixer.update(dt);
    if (h.bubble) h.bubble.visible = talking;
  }
  function disposeHuman(h) { if (h && h.glb) { GLB.count--; h.mixer.stopAllAction(); } }
  function upgradeAll() {
    avatars.forEach((a, uid) => { const p = lastState && lastState.players.find((x) => x.uid === uid); if (p) rebuildAvatar(a, p, a.isMe && ctl.previewing ? ctl.previewLook : p.look); });
    npcs.forEach((n) => {
      const old = n.h; const pos = old.root.position.clone(); const ry = old.root.rotation.y; const inter = old.hit.userData.inter;
      scene.remove(old.root); const h = makeHuman(n.looks); h.mopper = old.mopper; h.walkRate = 1.0;
      h.root.position.copy(pos); h.root.rotation.y = ry; h.hit.userData.inter = inter; scene.add(h.root); n.h = h;
    });
    Object.values(standers).forEach((pool) => { pool.forEach((h) => { scene.remove(h.root); disposeHuman(h); }); pool.length = 0; });
    if (lastState) update(lastState, me, myDept);
  }

  function makeHuman(o) {
    if (GLB.ready && GLB.count < GLB_MAX) return makeHumanGLB(o);
    return makeHumanProc(o);
  }

  function makeHumanProc(o) {
    const root = new T.Group(); root.rotation.order = 'YXZ';
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
      if (o.hair === 'braids') for (let i = 0; i < 7; i++) { const b = P('cyl', hairM, 0.05, 0.42, 0.05, -0.15 + i * 0.05, -0.16, -0.15 + Math.abs(i - 3) * 0.012, head); b.rotation.x = 0.18; }
    }
    if (o.glasses) { [-1, 1].forEach((s) => { const r = P('ring', mat(0x111111), 0.15, 0.15, 0.15, 0.068 * s, 0.03, 0.17, head); r.rotation.y = 0; }); P('box', mat(0x111111), 0.05, 0.012, 0.012, 0, 0.035, 0.175, head); }
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
    const hit = new T.Mesh(GEO.box, HIT_MAT); hit.scale.set(0.9, 2.3, 0.9); hit.position.y = 1.15; root.add(hit);
    if (o.sx || o.sy) root.scale.set(o.sx || 1, o.sy || 1, o.sx || 1);
    return { root, hips, legs, torso, head, mouth, arms, hit, phase: Math.random() * 6, walkW: 0, talkUntil: 0, seed: Math.random() * 10, bubble: null, pose: null, poseW: 0 };
  }

  function animateHuman(h, dt, moving, t) {
    if (h.glb) { animateGLB(h, dt, moving, t); return; }
    h.torso.rotation.x *= Math.max(0, 1 - dt * 8);
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
    h.poseW += ((h.pose ? 1 : 0) - h.poseW) * Math.min(1, dt * 6);
    const pw = h.poseW; if (pw < 0.01) return;
    const pose = h.pose || h.lastPose; h.lastPose = pose || h.lastPose;
    const mix = (obj, key, v) => { obj[key] += (v - obj[key]) * pw; };
    const sit = pose === 'sit' || pose === 'eat';
    if (sit) {
      h.hips.position.y += (0.62 - h.hips.position.y) * pw; h.torso.position.y += (0.67 - h.torso.position.y) * pw;
      h.legs.forEach((l) => { mix(l.hip.rotation, 'x', -1.45); mix(l.knee.rotation, 'x', 1.45); });
    }
    if (pose === 'eat') {
      const c = Math.max(0, Math.sin(t * 2.2 + h.seed));
      mix(h.arms[1].sh.rotation, 'x', -0.9 - c * 0.5); mix(h.arms[1].el.rotation, 'x', -1.2 - c * 0.7);
      mix(h.arms[0].sh.rotation, 'x', -0.5); mix(h.arms[0].el.rotation, 'x', -0.6);
      h.mouth.scale.y = 1 + c * 2;
    }
    if (pose === 'bend') {
      mix(h.torso.rotation, 'x', 0.5); const c = Math.sin(t * 3 + h.seed) * 0.15;
      h.arms.forEach((a) => { mix(a.sh.rotation, 'x', -1.0 + c); mix(a.el.rotation, 'x', -0.5); });
    }
    if (pose === 'wash') {
      const c = Math.sin(t * 9 + h.seed) * 0.2;
      h.arms.forEach((a, i) => { mix(a.sh.rotation, 'x', -0.85 + (i ? c : -c)); mix(a.el.rotation, 'x', -0.7); mix(a.sh.rotation, 'z', -0.25 * a.s); });
      mix(h.torso.rotation, 'x', 0.2);
    }
    if (pose === 'lie') {
      h.legs.forEach((l) => { mix(l.hip.rotation, 'x', 0); mix(l.knee.rotation, 'x', 0.1); });
      h.arms.forEach((a) => { mix(a.sh.rotation, 'x', 0); mix(a.el.rotation, 'x', -0.2); });
      mix(h.head.rotation, 'y', 0); h.torso.scale.y = 1 + Math.sin(t * 1.2) * 0.02;
    }
    if (pose === 'wave') { mix(h.arms[1].sh.rotation, 'x', -2.6); mix(h.arms[1].sh.rotation, 'z', 0.4 + Math.sin(t * 10) * 0.3); mix(h.arms[1].el.rotation, 'x', -0.3); }
    if (pose !== 'bend' && pose !== 'wash') h.torso.rotation.x *= (1 - pw);
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

  function looksFor(role, seed, look) {
    const base0 = looksForRole(role, seed);
    if (!look) return base0;
    const o = { ...base0, female: look.sex === undefined ? base0.female : look.sex === 0, skin: SKIN[look.skin] ?? base0.skin, hair: look.hair || base0.hair, hairCol: HAIR[look.hairc] ?? base0.hairCol,
      glasses: !!look.glasses, sx: [0.9, 1, 1.13][look.build] || 1, sy: [0.94, 1, 1.07][look.height] || 1 };
    if (look.hair === 'wrap') o.wrapMat = KENTE[hash(seed) % 3];
    if (UNI[look.uni]) { o.top = UNI[look.uni]; if (!o.coat || role === 'nurse' || role === 'midwife') o.bottom = UNI[look.uni]; }
    return o;
  }
  function looksForRole(role, seed) {
    const female = hash(seed) % 2 === 0; const skin = SKIN[hash(seed + 'k') % SKIN.length];
    const fem = female;
    const base = { skin, top: ROLE_COL[role] || 0x667788, bottom: ROLE_COL[role] || 0x667788, vneck: true,
      hair: female ? ['bun', 'long', 'braids'][hash(seed + 'h') % 3] : ['short', 'low'][hash(seed + 'h') % 2], hairCol: HAIR[hash(seed) % 3], female: fem };
    if (role === 'doctor') Object.assign(base, { coat: true, stetho: true, bottom: 0x2F3E4E });
    if (role === 'student') Object.assign(base, { coat: true, top: 0x5B6CF0, bottom: 0x2F3E4E });
    if (role === 'nurse' || role === 'midwife') Object.assign(base, { cap: true, skirt: female, hair: female ? 'bun' : 'low' });
    if (role === 'pharmacist' || role === 'lab_scientist') Object.assign(base, { coat: true, bottom: 0x2F3E4E });
    if (role === 'paramedic') Object.assign(base, { top: 0x1E7A3A, bottom: 0x1E7A3A, vneck: false });
    return base;
  }

  function avatarFor(p) {
    const h = makeHuman(looksFor(p.role, p.uid + p.name, p.look));
    const label = textSprite(p.name, { w: 4.2, size: 44 }); label.position.y = 2.75; h.root.add(label);
    scene.add(h.root);
    h.hit.userData.inter = { kind: 'person', name: p.name, uid: p.uid, role: p.role };
    return { h, label, dept: null, path: [], target: null, hasPos: false, moving: false, name: p.name, lookKey: JSON.stringify(p.look || null) };
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
      { kind: 'security', at: new T.Vector3(FACS.ndh.x - 4.5, 0, FACS.ndh.gate.z + 2.6), looks: { top: 0x1F2D44, bottom: 0x1F2D44, hair: 'low', vneck: false }, fixed: true },
      { kind: 'relative', pair: 2, at: new T.Vector3(FACS.ndh.x - 6, 0, FACS.ndh.z + D2 / 2 + G / 2), looks: { skirt: true, topMat: KENTE[0], skirtMat: KENTE[0], bottom: 0x3A2A1A, hair: 'wrap', wrapMat: KENTE[2] }, fixed: true },
      { kind: 'relative', pair: 2, at: new T.Vector3(FACS.ndh.x - 4.7, 0, FACS.ndh.z + D2 / 2 + G / 2), looks: { top: 0xF4F6F8, bottom: 0x23303B, hair: 'low' }, fixed: true },
      { kind: 'relative', at: new T.Vector3(FACS.och.x + 3, 0, FACS.och.z + D2 / 2 + G / 2), looks: { skirt: true, topMat: KENTE[1], skirtMat: KENTE[1], bottom: 0x3A2A1A, hair: 'wrap', wrapMat: KENTE[0] }, fixed: true },
      { kind: 'vendor', at: new T.Vector3(FACS.apc.x + 4.5, 0, FACS.apc.gate.z + 2.8), looks: { skirt: true, topMat: KENTE[2], skirtMat: KENTE[2], bottom: 0x3A2A1A, hair: 'wrap', wrapMat: KENTE[1], basin: true }, fixed: true },
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
      const looks = { skin: SKIN[i % SKIN.length], female: !!(s.looks.skirt || s.looks.hair === 'wrap' || s.looks.hair === 'bun'), ...s.looks };
      if (looks.mop) looks.female = s.looks.hair === 'wrap';
      const h = makeHuman(looks); h.mopper = !!s.looks.mop; h.walkRate = 1.0;
      const pos = s.at ? s.at.clone() : cps[i % cps.length].clone();
      h.root.position.copy(pos); scene.add(h.root);
      const npc = { h, looks, kind: s.kind, fixed: !!s.fixed, pair: s.pair, path: [], wait: 2 + Math.random() * 6, nextLine: 4 + Math.random() * 18, cps };
      h.hit.userData.inter = { kind: 'npc', npc, name: { relative: 'Relative', cleaner: 'Cleaner', security: 'Security', vendor: 'Pure water seller' }[s.kind] };
      npcs.push(npc);
    });
    // the talking pair faces each other
    [1, 2].forEach((k) => { const pr = npcs.filter((n) => n.pair === k); if (pr.length === 2) { pr[0].h.root.rotation.y = Math.PI / 2; pr[1].h.root.rotation.y = -Math.PI / 2; } });
    npcs.filter((n) => n.kind === 'security' || n.kind === 'vendor').forEach((n) => { n.h.root.rotation.y = 0; });
  }
  function updateNPC(n, dt, t) {
    const g = n.h.root;
    let moving = false;
    if (!n.fixed) {
      if (n.path.length) {
        const nx = n.path[0]; const dx = nx.x - g.position.x; const dz = nx.z - g.position.z; const d = Math.hypot(dx, dz);
        const sp = (n.kind === 'cleaner' ? 1.1 : 1.7) * dt;
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
  const FAR_X = 70; const ambDest = {};
  function roadPath(slot, dest, destFac) {
    const park = BAY_SLOTS[slot % 3]; const road = (x) => new T.Vector3(x, 0, ROAD_Z + 1.4);
    const pts = [park.clone(), road(park.x)];
    if (destFac && FACS[destFac]) { const F = FACS[destFac]; pts.push(road(F.x), F.gate.clone()); }
    else pts.push(road(/centre|Centre|Unit|Hospital/.test(dest || '') ? ROAD_X - 6 : -ROAD_X + 6));
    return pts;
  }
  function placeAmbulance(a) {
    const pts = a.path; const g = a.g; if (!pts || pts.length < 2) return;
    const segs = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); segs.push(l); total += l; }
    let d = Math.max(0, Math.min(1, a.p)) * total; let i = 0;
    while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
    const A = pts[i]; const B = pts[i + 1]; const k = segs[i] ? d / segs[i] : 0;
    g.position.set(A.x + (B.x - A.x) * k, 0, A.z + (B.z - A.z) * k);
    let dx = B.x - A.x; let dz = B.z - A.z; if (a.reverse) { dx = -dx; dz = -dz; }
    if (Math.hypot(dx, dz) > 0.01) g.rotation.y = Math.atan2(dz, -dx);
    g.visible = Math.abs(g.position.x) < ROAD_X - 3;
  }


  // ---------- update from server state ----------
  function update(st, meIn, myDeptIn) {
    if (!renderer) return;
    me = meIn; myDept = myDeptIn;
    if (!needsKey && me) { loadNeeds(me.uid); refreshHud(); }
    const byRoom = {};
    st.patients.forEach((p) => { if (!HIDDEN.includes(p.stage) && RECT[p.loc]) (byRoom[p.loc] = byRoom[p.loc] || []).push(p); });

    Object.keys(RECT).forEach((id) => {
      const n = (byRoom[id] || []).length; const name = window.World3D._names[id] || STAFF_NAMES[id] || id;
      setSpriteText(roomLabels[id], n ? `${name}\n${n} patient${n > 1 ? 's' : ''}` : name);
      const here = (ctl.here || myDept) === id;
      roomFloors[id].material.emissive.setHex(here ? 0x0E7C7B : 0x000000);
      roomFloors[id].material.emissiveIntensity = here ? 0.18 : 0;
    });
    lastState = st;

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
        h.hit.userData.inter = { kind: 'patient', name: p.name, pid: p.pid };
      });
    });

    const seen = new Set();
    st.players.slice(0, 120).forEach((p) => {
      seen.add(p.uid);
      let a = avatars.get(p.uid);
      if (!a) { a = avatarFor(p); avatars.set(p.uid, a); }
      a.isMe = p.uid === me?.uid;
      const lk = JSON.stringify(p.look || null);
      if (a.lookKey !== lk && !(a.isMe && ctl.previewing)) rebuildAvatar(a, p, p.look);
      if (a.isMe) {
        if (!ctl.here && RECT[myDept]) { a.h.root.position.copy(spotIn(myDept, p.uid)); ctl.here = myDept; ctl.appDept = myDept; a.dept = myDept; }
        else if (myDept !== ctl.appDept) {
          ctl.appDept = myDept;
          if (myDept !== ctl.here && RECT[myDept]) { cancelTask(a); ctl.auto = routeToPoint(a.h.root.position, spotIn(myDept, p.uid)); }
        }
        a.label.visible = true;
        return;
      }
      const dept = p.dept;
      if (!RECT[dept]) return;
      if (a.dept !== dept) {
        const firstTime = !a.dept;
        if (!a.hasPos || performance.now() - a.posAt > 4000) {
          a.hasPos = false; const dest = spotIn(dept, p.uid);
          if (firstTime) a.h.root.position.copy(dest); else a.path = routeTo(a.h.root.position, dept, dest);
        }
        a.dept = dept;
      }
      a.label.visible = a.isMe || st.players.length <= 40;
    });
    avatars.forEach((a, uid) => { if (!seen.has(uid)) { scene.remove(a.h.root); disposeHuman(a.h); avatars.delete(uid); } });

    const want = new Map();
    (st.fleet || []).forEach((u, i) => {
      // progress along the road from the bay (0) to the destination (1)
      let p = 0; let siren = false; let reverse = false;
      if (u.status === 'out' || u.status === 'transfer') { p = 1 - Math.max(0, u.left / u.total); siren = true; }
      if (u.status === 'back') { p = Math.max(0, u.left / u.total); reverse = true; siren = true; }
      if (u.status !== 'base') ambDest[i] = { dest: u.dest, fac: u.dest_fac };
      const dd = ambDest[i] || {};
      want.set(`u${i}`, { p, siren, reverse, path: roadPath(i, dd.dest, dd.fac) });
    });
    let extra = 0;
    st.patients.forEach((p) => {
      if (p.stage === 'en_route' && !p.unit && extra < 3) {
        want.set(`p${p.pid}`, { p: Math.min(1, 1 - p.eta / Math.max(1, p.eta_total)), siren: true, reverse: false, path: roadPath(extra, 'from town', null).reverse() }); extra++;
      }
    });
    if (!(st.fleet || []).length) st.patients.filter((p) => p.loc === 'ambulance' && ['arrived', 'transfer'].includes(p.stage)).slice(0, 3).forEach((p, i) => want.set(`p${p.pid}`, { p: 1, siren: false, slot: i }));
    want.forEach((w, key) => { let a = ambs.get(key); if (!a) { a = makeAmbulance(); ambs.set(key, a); } a.target = w.p; if (a.p === undefined || a.reverse !== !!w.reverse) a.p = w.p; a.siren = w.siren; a.reverse = !!w.reverse; a.path = w.path; });
    ambs.forEach((a, key) => { if (!want.has(key)) { scene.remove(a.g); ambs.delete(key); } });

    const evDept = st.session ? st.session.dept : st.next && st.next.round_ward;
    eventMarker.visible = !!(evDept && RECT[evDept]);
    if (eventMarker.visible) eventMarker.position.set(RECT[evDept].x + RECT[evDept].w / 2 - 1.2, 5.2, RECT[evDept].z - RECT[evDept].d / 2 + 1);
    applyLighting(st);
  }

  function positions(list) {
    list.forEach(([uid, x, z, ry, m, pz]) => {
      const a = avatars.get(uid); if (!a || a.isMe) return;
      a.hasPos = true; a.posAt = performance.now(); a.path = []; a.target = { x, z, ry, m };
      a.h.pose = POSES[pz || 0] || null;
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
    const mag = Math.min(1, Math.hypot(jx, jy)); const speed = moodSpeed();
    if (mag > 0.12 && !ctl.previewing) {
      if (ctl.task) cancelTask(a);
      ctl.auto = [];
      const fx = -Math.sin(cam.yaw); const fz = -Math.cos(cam.yaw); const rx = Math.cos(cam.yaw); const rz = -Math.sin(cam.yaw);
      let dx = fx * jy + rx * jx; let dz = fz * jy + rz * jx; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const sp = 3.6 * mag * dt * speed;
      if (stepFrom(g.position, dx * sp, dz * sp)) moving = true;
      const want = Math.atan2(dx, dz); g.rotation.y += angleDiff(want, g.rotation.y) * Math.min(1, dt * 12);
      if (cam.mode === 'walk' && jy > 0.3) cam.yaw += angleDiff(g.rotation.y + Math.PI, cam.yaw) * Math.min(1, dt * 1.2);
    } else if (ctl.auto.length && ctl.auto[0].teleport) {
      const nx = ctl.auto.shift();
      travelFade(nx.facName, () => { g.position.set(nx.x, 0, nx.z); if (cam.mode !== 'walk') { cam.target.set(nx.x, 0, nx.z - 4); cam.dist = Math.min(cam.dist, 46); } });
      ctl.auto = ctl.auto.slice(0); ctl.pauseUntil = performance.now() + 700;
    } else if (ctl.auto.length && performance.now() > (ctl.pauseUntil || 0)) {
      const nx = ctl.auto[0]; const dx = nx.x - g.position.x; const dz = nx.z - g.position.z; const d = Math.hypot(dx, dz); const sp = 3.4 * dt * speed;
      if (d <= sp) { g.position.set(nx.x, 0, nx.z); ctl.auto.shift(); } else { g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = Math.atan2(dx, dz); moving = true; }
    } else if (ctl.task && ctl.task.phase === 'walk' && !ctl.auto.length) startTask(a);
    if (ctl.task && ctl.task.phase === 'do') runTask(a, dt);
    const room = roomAt(g.position.x, g.position.z, 0.6);
    if (room && room !== ctl.here) {
      ctl.here = room;
      if (!STAFF_ROOMS.includes(room)) { ctl.appDept = room; myDept = room; if (onRoom) onRoom(room); }
      const fName = facOfRoom(room) === 'akt' ? '' : `${FACS[facOfRoom(room)].short}, `;
      if (hooks.onHere) hooks.onHere(room, fName + (window.World3D._names[room] || STAFF_NAMES[room] || room));
    }
    const now = performance.now();
    if (now - ctl.lastSend > 200 && sendFn) {
      const pz = Math.max(0, POSES.indexOf(a.h.pose));
      const key = `${g.position.x.toFixed(1)},${g.position.z.toFixed(1)},${moving},${pz},${g.rotation.y.toFixed(1)}`;
      if (key !== ctl.sent) {
        ctl.sent = key; ctl.lastSend = now;
        sendFn({ a: 'pos', x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2), ry: +Math.atan2(Math.sin(g.rotation.y), Math.cos(g.rotation.y)).toFixed(2), m: moving ? 1 : 0, p: pz });
      }
    }
    return moving;
  }

  // ---------- Sims-style tasks: walk there, act it out, then the effect ----------
  const POSES = [null, 'sit', 'eat', 'bend', 'wash', 'lie', 'wave'];
  function facAt(x, z) {
    const room = roomAt(x, z, 0); if (room) return facOfRoom(room);
    for (const [f, F] of Object.entries(FACS)) if (Math.abs(x - F.x) < F.w / 2 + 3 && z < F.gate.z + 2 && z > F.z - D2) return f;
    return 'akt';
  }
  function routeToPoint(pos, point) {
    const from = roomAt(pos.x, pos.z, 0); const to = roomAt(point.x, point.z, 0);
    const fa = facAt(pos.x, pos.z); const fb = facAt(point.x, point.z);
    if (fa !== fb) {
      const arrive = to ? doorOut(to) : point.clone(); arrive.teleport = true; arrive.facName = fb === 'akt' ? 'Akwaaba Teaching Hospital' : FACS[fb].name;
      return to ? [arrive, doorIn(to), point.clone()] : [arrive];
    }
    if (from && from === to) return [point.clone()];
    const pts = []; let P = pos.clone();
    if (from) { pts.push(doorIn(from), doorOut(from)); P = doorOut(from); }
    if (to) pts.push(...corridorRoute(P, doorOut(to)), doorIn(to), point.clone());
    else pts.push(...corridorRoute(P, point));
    return pts;
  }
  function doTask(task) {
    const a = myAvatar(); if (!a) return;
    cancelTask(a);
    ctl.task = { ...task, phase: 'walk', t: 0 };
    ctl.auto = task.stand ? routeToPoint(a.h.root.position, task.stand) : [];
  }
  function startTask(a) {
    const tk = ctl.task; const g = a.h.root;
    if (tk.place) tk.place(g);
    else if (tk.face) g.rotation.y = Math.atan2(tk.face.x - g.position.x, tk.face.z - g.position.z);
    a.h.pose = tk.pose || null; tk.phase = 'do'; tk.t = 0;
    if (tk.start) tk.start(a);
  }
  function runTask(a, dt) {
    const tk = ctl.task; tk.t += dt;
    if (tk.tick) tk.tick(dt);
    clampNeeds();
    if ((tk.dur && tk.t >= tk.dur) || (tk.until && tk.until())) finishTask(a, true);
  }
  function finishTask(a, ok) {
    const tk = ctl.task; if (!tk) return;
    ctl.task = null; a.h.pose = null;
    if (tk.restore) tk.restore(a.h.root);
    if (ok && tk.done) tk.done();
    refreshHud();
  }
  function cancelTask(a) { if (ctl.task) finishTask(a || myAvatar(), false); }
  function rebuildAvatar(a, p, look) {
    const old = a.h; const pos = old.root.position.clone(); const ry = old.root.rotation.y; const rx = old.root.rotation.x; const py = old.root.position.y;
    scene.remove(old.root); disposeHuman(old);
    const h = makeHuman(looksFor(p.role, p.uid + p.name, look));
    h.root.position.copy(pos); h.root.position.y = py; h.root.rotation.y = ry; h.root.rotation.x = rx; h.pose = old.pose; h.walkRate = 1.9; h.root.add(a.label);
    h.hit.userData.inter = old.hit.userData.inter; scene.add(h.root);
    a.h = h; a.lookKey = JSON.stringify(look || null);
  }

  // ---------- needs and moodlets ----------
  const NEED_DEF = [['energy', 'Energy', 'bi-battery-half', 2.0], ['hunger', 'Hunger', 'bi-egg-fried', 2.5], ['bladder', 'Bladder', 'bi-droplet-half', 3.0],
    ['hygiene', 'Hygiene', 'bi-stars', 1.5], ['social', 'Social', 'bi-chat-heart', 2.0], ['calm', 'Calm', 'bi-emoji-smile', 1.5]];
  const needs = {}; let needsKey = null; let saveAt = 0; let hud = null; let hudAt = 0;
  const moodlets = []; const warned = {};
  const clampNeeds = () => NEED_DEF.forEach(([k]) => { needs[k] = Math.max(0, Math.min(100, needs[k])); });
  function loadNeeds(uid) {
    needsKey = `wl_needs_${uid}`;
    try { Object.assign(needs, JSON.parse(localStorage.getItem(needsKey)) || {}); } catch (_) { /* fresh start */ }
    NEED_DEF.forEach(([k]) => { if (typeof needs[k] !== 'number') needs[k] = 85; });
  }
  function addMood(id, text, good, secs) {
    const i = moodlets.findIndex((m) => m.id === id); if (i >= 0) moodlets.splice(i, 1);
    moodlets.push({ id, text, good, until: clock + secs }); refreshHud();
  }
  function allMoodlets() {
    const list = moodlets.filter((m) => m.until > clock);
    const low = { energy: 'Exhausted', hunger: 'Hungry', bladder: 'Needs the loo', hygiene: 'Feeling grubby', social: 'Lonely', calm: 'Stressed' };
    NEED_DEF.forEach(([k]) => { if (needs[k] < 25) list.push({ id: k, text: low[k], good: false }); });
    return list;
  }
  function moodScore() {
    const avg = NEED_DEF.reduce((s, [k]) => s + needs[k], 0) / NEED_DEF.length;
    const bonus = moodlets.filter((m) => m.until > clock).reduce((s, m) => s + (m.good ? 8 : -10), 0);
    return Math.max(0, Math.min(100, avg + bonus));
  }
  function moodSpeed() { if (needs.energy < 10) return 0.6; return moodScore() < 35 ? 0.78 : 1; }
  function cantWork() {
    if (needs.energy < 6) return 'You are too exhausted to work safely. Take a nap in the On-call room.';
    if (needs.bladder < 5) return 'You really need the toilet first. Go to the Staff washroom.';
    if (needs.hunger < 4) return 'You are too hungry to concentrate. Eat something in the Staff canteen.';
    return null;
  }
  function tickNeeds(dt) {
    if (!needsKey) return;
    const resting = ctl.task && ctl.task.phase === 'do';
    NEED_DEF.forEach(([k, , , d]) => { if (!(resting && ctl.task.refills && ctl.task.refills.includes(k))) needs[k] -= d * dt / 60; });
    const st = lastState;
    if (st && st.patients.some((p) => p.loc === ctl.here && p.tri === 'red' && p.stage !== 'inpatient')) needs.calm -= 2.5 * dt / 60;
    clampNeeds();
    const tips = { energy: 'You are getting tired. Bunk beds are in the On-call room.', hunger: 'You are getting hungry. The Staff canteen has jollof and waakye.',
      bladder: 'You need the toilet. The Staff washroom is on the right of the hospital.', hygiene: 'Time to wash up at the Staff washroom sinks.',
      social: 'You are feeling lonely. Tap a colleague or a relative to chat.', calm: 'You are stressed. Take a break with a hot cocoa in the canteen.' };
    NEED_DEF.forEach(([k]) => {
      if (needs[k] < 25 && !warned[k]) { warned[k] = true; if (hooks.notify) hooks.notify(tips[k]); }
      if (needs[k] > 40) warned[k] = false;
    });
    if (clock - saveAt > 5) { saveAt = clock; try { localStorage.setItem(needsKey, JSON.stringify(needs)); } catch (_) { /* storage full */ } }
    if (clock - hudAt > 0.5) { hudAt = clock; refreshHud(); }
  }
  function moodColor(s) { return s >= 60 ? '#2E9E5B' : s >= 35 ? '#E9B824' : '#D7263D'; }
  function buildHud(el) {
    hud = document.createElement('div'); hud.className = 'sims-hud collapsed';
    hud.innerHTML = `<button class="mood-btn" type="button" aria-expanded="false"><span class="mood-dot"></span><span class="mood-text">Mood</span><i class="bi bi-chevron-down"></i></button>
      <div class="needs">${NEED_DEF.map(([k, label, icon]) => `<div class="need" data-need="${k}"><i class="bi ${icon}" aria-hidden="true"></i><span>${label}</span><b><i></i></b></div>`).join('')}</div>
      <div class="moodlets"></div>`;
    hud.querySelector('.mood-btn').addEventListener('click', () => { const c = hud.classList.toggle('collapsed'); hud.querySelector('.mood-btn').setAttribute('aria-expanded', String(!c)); });
    hud.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.appendChild(hud);
  }
  function refreshHud() {
    if (!hud || !needsKey) return;
    const s = moodScore(); const col = moodColor(s);
    hud.querySelector('.mood-dot').style.background = col;
    hud.querySelector('.mood-text').textContent = s >= 75 ? 'Very happy' : s >= 60 ? 'Happy' : s >= 35 ? 'Uncomfortable' : 'Miserable';
    NEED_DEF.forEach(([k]) => { const bar = hud.querySelector(`[data-need="${k}"] b i`); bar.style.width = `${needs[k]}%`; bar.style.background = moodColor(needs[k]); });
    hud.querySelector('.moodlets').innerHTML = allMoodlets().slice(0, 4).map((m) => `<span class="moodlet ${m.good ? 'good' : 'bad'}">${m.text}</span>`).join('');
    if (moodCross) moodCross.children.forEach((c) => { c.material.color.set(col); c.material.emissive.set(col); });
  }

  // ---------- click-to-interact menus ----------
  let pie = null;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const LINES_ME = {
    chat: ['Ɛte sɛn? How is your shift going?', 'Morning! Busy day so far?', 'Ayekoo, well done today!', 'Have you eaten anything yet?'],
    joke: ['I have been on call so long my tea needs a tea.', 'Another power cut. At least the generator likes me.', 'If I hear one more pager tonight...'],
    opinion: ['Can I get a second opinion on a patient?', 'Could you look at my patient with me?', 'What would you give for this BP?'],
    reassure: ['You are in good hands.', 'We are taking care of you.', 'Rest now, the team is here.'],
    explain: ['We are running some tests, then the doctor will explain.', 'She is stable. We will keep watching her.', 'You can sit at the benches, we will call you.'],
  };
  const NPC_REPLY = { relative: ['Me da wo ase, Doctor!', 'God bless you.', 'Thank you, we will wait.', 'Ayekoo!'], cleaner: ['Yaa! Ayekoo to you too.', 'Mind the wet floor oo!'],
    security: ['Yaa! All is calm at the gate.', 'Akwaaba, Doctor.'], vendor: ['Thank you! Ice cold.', 'Enjoy, Doctor!'] };
  function nearSpot(target, from, d = 1.2) {
    const dx = from.x - target.x; const dz = from.z - target.z; const l = Math.hypot(dx, dz) || 1;
    return new T.Vector3(target.x + dx / l * d, 0, target.z + dz / l * d);
  }
  function work(fn) { return () => { const why = cantWork(); if (why) { if (hooks.notify) hooks.notify(why); return; } fn(); }; }
  function patientItems(pid, stand, face) {
    const items = (hooks.patientActions ? hooks.patientActions(pid) : []).map((it) => ({
      label: it.label, icon: it.data.a === 'folder' ? 'bi-folder2-open' : 'bi-clipboard2-pulse',
      run: it.data.a === 'folder' ? () => hooks.act(it.data) : work(() => doTask({ stand, face, pose: 'bend', dur: 2.2, refills: [], done: () => { hooks.act(it.data); needs.energy -= 1.5; needs.calm -= 1; } })),
    }));
    items.push({ label: 'Reassure', icon: 'bi-hand-thumbs-up', run: () => doTask({ stand, face, dur: 3, start: (a) => say(a.h, pick(LINES_ME.reassure), 3), done: () => { needs.social += 8; needs.calm += 4; } }) });
    items.push({ label: 'Check pulse', icon: 'bi-heart-pulse', run: () => doTask({ stand, face, pose: 'bend', dur: 3, done: () => { needs.calm += 2; } }) });
    return items;
  }
  function staffQueue(kind, site) {
    const st = lastState; if (!st) return [];
    if (kind === 'lab' || kind === 'ct') {
      const d = site || (kind === 'lab' ? 'lab' : 'radiology'); const out = [];
      st.patients.forEach((p) => p.pend.filter((t) => (t.s || t.d) === d).forEach((t) => out.push({ p, t })));
      return out;
    }
    if (kind === 'pharmacy') return st.patients.filter((p) => p.stage === 'pharmacy').map((p) => ({ p }));
    if (kind === 'records') return st.patients.filter((p) => p.stage === 'registration').map((p) => ({ p }));
    return [];
  }
  function menuFor(inter) {
    const a = myAvatar(); const myPos = a ? a.h.root.position : new T.Vector3(); const role = me && me.role;
    const items = []; let title = inter.name; let note = '';
    if (inter.kind === 'bed') {
      const pid = inter.slot.pid; const p = pid && lastState && lastState.patients.find((x) => x.pid === pid);
      if (!p) { note = 'Nobody is in this bed.'; }
      else { title = `${p.name}, ${p.age}${p.sex}`; items.push(...patientItems(pid, inter.stand, inter.face)); }
    } else if (inter.kind === 'patient') {
      const h = [...Object.values(standers)].flat().find((x) => x.hit.userData.inter === inter);
      const pos = h ? h.root.position : myPos; title = inter.name;
      items.push(...patientItems(inter.pid, new T.Vector3(pos.x, 0, pos.z - 1.1), pos.clone()));
    } else if (inter.kind === 'person') {
      if (inter.uid === me?.uid) {
        items.push({ label: 'Change my look', icon: 'bi-person-gear', run: () => hooks.openCreator && hooks.openCreator() });
        items.push({ label: 'Wave', icon: 'bi-hand-index-thumb', run: () => doTask({ pose: 'wave', dur: 2 }) });
        title = 'You';
      } else {
        const other = avatars.get(inter.uid); const pos = other ? other.h.root.position : myPos;
        const talk = (kind, social) => () => doTask({ stand: nearSpot(pos, myPos), face: pos.clone(), dur: 3,
          start: () => { if (hooks.chat) hooks.chat(kind === 'chat' ? `${pick(LINES_ME.chat)}` : pick(LINES_ME[kind])); },
          done: () => { needs.social += social; needs.calm += 3; addMood('chatted', 'Had a good chat', true, 150); } });
        items.push({ label: 'Chat', icon: 'bi-chat-dots', run: talk('chat', 18) });
        items.push({ label: 'Tell a joke', icon: 'bi-emoji-laughing', run: talk('joke', 14) });
        items.push({ label: 'Ask for a second opinion', icon: 'bi-people', run: talk('opinion', 10) });
        items.push({ label: 'Wave', icon: 'bi-hand-index-thumb', run: () => doTask({ face: pos.clone(), pose: 'wave', dur: 2, done: () => { needs.social += 3; } }) });
      }
    } else if (inter.kind === 'npc') {
      const n = inter.npc; const pos = n.h.root.position;
      const chatNpc = (myLine, social, extra) => () => doTask({ stand: nearSpot(pos, myPos), face: pos.clone(), dur: 3.2,
        start: (me2) => { say(me2.h, myLine, 3); n.path = []; n.wait = 8; n.h.root.rotation.y = Math.atan2(me2.h.root.position.x - pos.x, me2.h.root.position.z - pos.z); setTimeout(() => say(n.h, pick(NPC_REPLY[n.kind]), 3), 1500); },
        done: () => { needs.social += social; needs.calm += 4; if (extra) extra(); } });
      if (n.kind === 'relative') {
        items.push({ label: 'Explain the plan', icon: 'bi-chat-square-text', run: chatNpc(pick(LINES_ME.explain), 12, () => addMood('kind', 'Kind words', true, 180)) });
        items.push({ label: 'Comfort', icon: 'bi-heart', run: chatNpc('Don\'t worry, we are doing everything we can.', 10) });
      }
      if (n.kind === 'vendor') items.push({ label: 'Buy pure water', icon: 'bi-cup-straw', run: chatNpc('One pure water, please.', 4, () => { needs.hunger += 6; needs.bladder -= 8; needs.calm += 3; }) });
      items.push({ label: 'Greet', icon: 'bi-hand-index-thumb', run: chatNpc(n.kind === 'relative' ? 'Ɛte sɛn?' : 'Ayekoo!', 6) });
    } else if (inter.kind === 'canteen') {
      const eat = (food, secs, pose, fx, mood) => () => {
        const seat = SEATS.filter((s) => !s.taken).sort((s1, s2) => s1.pos.distanceTo(myPos) - s2.pos.distanceTo(myPos))[0];
        if (!seat) { if (hooks.notify) hooks.notify('All the canteen seats are taken.'); return; }
        doTask({ stand: seat.pos, pose, dur: secs, refills: Object.keys(fx),
          place: (g) => { seat.taken = true; g.position.copy(seat.pos); g.rotation.y = Math.atan2(seat.face.x - seat.pos.x, seat.face.z - seat.pos.z); },
          restore: () => { seat.taken = false; },
          start: (a2) => say(a2.h, food, 2.5),
          tick: (dt) => Object.entries(fx).forEach(([k, v]) => { needs[k] += v * dt / secs; }),
          done: () => addMood(mood[0], mood[1], true, 200) });
      };
      items.push({ label: 'Eat jollof', icon: 'bi-egg-fried', run: eat('Mmm, this jollof!', 9, 'eat', { hunger: 70, calm: 8 }, ['fed', 'Well fed']) });
      items.push({ label: 'Eat waakye', icon: 'bi-egg-fried', run: eat('Waakye with shito, yes!', 9, 'eat', { hunger: 75, calm: 6 }, ['fed', 'Well fed']) });
      items.push({ label: 'Eat kenkey and fish', icon: 'bi-egg-fried', run: eat('Kenkey and fried fish!', 9, 'eat', { hunger: 80 }, ['fed', 'Well fed']) });
      items.push({ label: 'Eat red red', icon: 'bi-egg-fried', run: eat('Red red and plantain!', 8, 'eat', { hunger: 65, calm: 5 }, ['fed', 'Well fed']) });
      items.push({ label: 'Drink hot cocoa', icon: 'bi-cup-hot', run: eat('Ghana cocoa, the best.', 5, 'sit', { calm: 30, energy: 8, hunger: 8 }, ['cocoa', 'Cocoa break']) });
    } else if (inter.kind === 'bunk') {
      const b = inter.bunk;
      const nap = (label, until, dur) => ({ label, icon: 'bi-moon-stars', run: () => {
        if (b.taken) { if (hooks.notify) hooks.notify('Someone is already on that bunk.'); return; }
        doTask({ stand: inter.stand, pose: 'lie', refills: ['energy'], until, dur,
          place: (g) => { b.taken = true; g.position.set(b.pos.x + 1.05, 0.72, b.pos.z); g.rotation.x = -Math.PI / 2; g.rotation.y = Math.PI / 2; },
          restore: (g) => { b.taken = false; g.rotation.x = 0; g.position.set(inter.stand.x, 0, inter.stand.z); },
          start: (a2) => say(a2.h, 'Zzz...', 2),
          tick: (dt) => { needs.energy += 5 * dt; needs.calm += 0.8 * dt; },
          done: () => addMood('rested', 'Well rested', true, 300) });
      } });
      items.push(nap('Sleep until rested', () => needs.energy >= 99, 0));
      items.push(nap('Power nap', null, 20));
    } else if (inter.kind === 'toilet') {
      items.push({ label: 'Use the toilet', icon: 'bi-droplet', run: () => doTask({ stand: inter.stand, pose: 'sit', dur: 5, refills: ['bladder'],
        place: (g) => { g.position.copy(inter.seat); g.rotation.y = 0; }, restore: (g) => g.position.copy(inter.stand),
        tick: (dt) => { needs.bladder += 22 * dt; } }) });
    } else if (inter.kind === 'sink') {
      items.push({ label: 'Wash up', icon: 'bi-stars', run: () => doTask({ stand: inter.stand, face: inter.face, pose: 'wash', dur: 5, refills: ['hygiene'], tick: (dt) => { needs.hygiene += 20 * dt; } }) });
      items.push({ label: 'Wash hands', icon: 'bi-droplet-half', run: () => doTask({ stand: inter.stand, face: inter.face, pose: 'wash', dur: 3, tick: (dt) => { needs.hygiene += 4 * dt; }, done: () => addMood('hands', 'Clean hands', true, 240) }) });
    } else if (['lab', 'ct', 'pharmacy', 'records'].includes(inter.kind)) {
      const q = staffQueue(inter.kind, inter.site);
      const need = { lab: 'lab_scientist', ct: 'radiographer', pharmacy: 'pharmacist' }[inter.kind];
      const districtLab = inter.site && inter.site.endsWith('_lab') && ['lab_scientist', 'radiographer'].includes(role);
      if (need && role !== need && !districtLab) note = { lab: 'Only lab scientists run tests here.', ct: 'Only radiographers run scans here.', pharmacy: 'Only pharmacists dispense here.' }[inter.kind];
      else if (!q.length) note = { lab: 'No samples waiting.', ct: 'No scans waiting.', pharmacy: 'No prescriptions waiting.', records: 'Nobody is waiting for a folder.' }[inter.kind];
      else {
        const { p, t } = q[0]; const go = (data, label, icon) => items.push({ label, icon, run: work(() => doTask({ stand: inter.stand, face: inter.face, pose: 'bend', dur: 2.5, done: () => { hooks.act(data); needs.energy -= 1; } })) });
        if (inter.kind === 'lab' || inter.kind === 'ct') go({ a: 'run_test', pid: p.pid, test: t.k }, `${t.n} for ${p.name}`, 'bi-droplet-half');
        if (inter.kind === 'pharmacy') { go({ a: 'dispense', pid: p.pid }, `Dispense for ${p.name}`, 'bi-capsule'); go({ a: 'dispense', pid: p.pid, query: '1' }, `Query ${p.name}'s prescription`, 'bi-question-octagon'); }
        if (inter.kind === 'records') go({ a: 'register', pid: p.pid }, `Open a folder for ${p.name}`, 'bi-folder-plus');
      }
    }
    return { title, items, note };
  }
  function openMenu(inter, x, y) {
    closeMenu();
    const m = menuFor(inter); const r = container.getBoundingClientRect();
    pie = document.createElement('div'); pie.className = 'pie';
    const cx = Math.min(Math.max(x - r.left, 170), r.width - 170); const cy = Math.min(Math.max(y - r.top, 115), r.height - 115);
    pie.style.left = `${cx}px`; pie.style.top = `${cy}px`;
    const n = m.items.length; const rx = n > 4 ? 140 : 110; const ry = n > 4 ? 92 : 78;
    pie.innerHTML = `<div class="pie-title">${escapeHtml(m.title)}${m.note ? `<small>${escapeHtml(m.note)}</small>` : ''}</div>` + m.items.map((it, i) => {
      const ang = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
      return `<button type="button" class="pie-item" data-i="${i}" style="transform: translate(calc(${Math.cos(ang) * rx}px - 50%), calc(${Math.sin(ang) * ry}px - 50%))"><i class="bi ${it.icon || 'bi-dot'}"></i>${escapeHtml(it.label)}</button>`;
    }).join('');
    pie.addEventListener('pointerdown', (e) => e.stopPropagation());
    pie.addEventListener('click', (e) => { const b = e.target.closest('.pie-item'); if (!b) { closeMenu(); return; } const it = m.items[+b.dataset.i]; closeMenu(); it.run(); });
    container.appendChild(pie);
  }
  function closeMenu() { if (pie) { pie.remove(); pie = null; } }
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let fadeEl = null;
  function travelFade(name, mid) {
    if (!fadeEl) { fadeEl = document.createElement('div'); fadeEl.className = 'travel-fade'; container.appendChild(fadeEl); }
    fadeEl.innerHTML = `<div><i class="bi bi-car-front-fill"></i> Travelling to ${name}</div>`;
    fadeEl.classList.add('show');
    setTimeout(() => { mid(); setTimeout(() => fadeEl.classList.remove('show'), 250); }, 420);
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
        const nx = a.path[0]; const dx = nx.x - g.position.x; const dz = nx.z - g.position.z; const d = Math.hypot(dx, dz); const sp = 3.4 * dt;
        if (d <= sp) { g.position.set(nx.x, 0, nx.z); a.path.shift(); } else { g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = Math.atan2(dx, dz); moving = true; }
      }
      if (!a.isMe) {
        const lying = a.h.pose === 'lie';
        if (lying && a.h.root.rotation.x === 0) { a.h.root.rotation.x = -Math.PI / 2; a.h.root.position.y = 0.72; }
        if (!lying && a.h.root.rotation.x !== 0) { a.h.root.rotation.x = 0; a.h.root.position.y = 0; }
      }
      animateHuman(a.h, dt, moving, t);
      const k = cam.mode === 'walk' ? 1 : Math.max(0.7, Math.min(1.9, cam.dist / 40));
      a.label.scale.set(4.2 * k, 1.05 * k, 1); a.label.position.y = cam.mode === 'walk' ? 2.75 : 3.1;
      if (a.isMe && ctl.previewing) a.label.visible = false;
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
      a.p += (a.target - a.p) * Math.min(1, dt * 1.5); placeAmbulance(a);
      const on = a.siren && Math.floor(t * 5) % 2 === 0;
      a.red.emissiveIntensity = a.siren ? (on ? 2.2 : 0.1) : 0; a.blue.emissiveIntensity = a.siren ? (on ? 0.1 : 2.2) : 0;
    });
    eventMarker.position.y = 5.2 + Math.sin(t * 3) * 0.35; eventMarker.rotation.y += dt * 1.5;
    tickNeeds(dt);
    if (ctl.previewing !== ctl.wasPreviewing) {
      ctl.wasPreviewing = ctl.previewing;
      npcs.forEach((n) => { n.h.root.visible = !ctl.previewing; });
      avatars.forEach((a) => { if (!a.isMe) a.h.root.visible = !ctl.previewing; });
    }
    const ls = cam.mode === 'walk' ? 0 : Math.max(0.38, Math.min(1, cam.dist / 68));
    Object.entries(roomLabels).forEach(([id, l]) => { l.visible = ls > 0 && !ctl.previewing; const base = id === 'conference' ? 10 : 8; l.scale.set(base * ls, base * ls / 4, 1); });
    const down = cam.mode === 'walk' || cam.dist < 46 || ctl.previewing;
    wallK += ((down ? 0.3 : 1) - wallK) * Math.min(1, dt * 4);
    wallMeshes.forEach((m) => { m.scale.y = wallK; });
    if (tapMarker.visible) { tapMarker.userData.t -= dt; tapMarker.scale.setScalar(1 + (0.8 - tapMarker.userData.t)); tapMarker.material.opacity = Math.max(0, tapMarker.userData.t); if (tapMarker.userData.t <= 0) tapMarker.visible = false; }
    const mine = myAvatar();
    if (mine && needsKey) {
      const lying = mine.h.pose === 'lie'; const k2 = cam.mode === 'walk' || ctl.previewing ? 1 : 1.8;
      moodCross.visible = true; moodCross.scale.setScalar(k2);
      moodCross.position.set(mine.h.root.position.x + (lying ? -1.2 : 0), lying ? 2.2 : (cam.mode === 'walk' || ctl.previewing ? 3.3 : 4.3), mine.h.root.position.z);
      moodCross.rotation.y += dt * 1.8;
    }
    placeCamera(dt);
    renderer.render(scene, camera);
  }

  function placeCamera() {
    if (ctl.previewing) {
      const a = myAvatar();
      if (a) {
        const g = a.h.root; const yaw = g.rotation.y + (ctl.previewYaw ?? 0.35);
        camera.position.set(g.position.x + Math.sin(yaw) * 4.4, 1.9, g.position.z + Math.cos(yaw) * 4.4);
        camera.lookAt(g.position.x, 1.2, g.position.z); return;
      }
    }
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
    else cam.dist = Math.min(380, Math.max(16, cam.dist * f));
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
    if (pie) { closeMenu(); return; }
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const people = [];
    avatars.forEach((a) => people.push(a.h.hit)); npcs.forEach((n) => people.push(n.h.hit));
    Object.values(standers).forEach((pool) => pool.forEach((h) => { if (h.root.visible) people.push(h.hit); }));
    const hits = raycaster.intersectObjects([...people, ...interactables], false);
    if (hits.length && hits[0].object.userData.inter) { openMenu(hits[0].object.userData.inter, e.clientX, e.clientY); return; }
    const fh = raycaster.intersectObjects([...floors, groundHit], false)[0];
    if (!fh) return;
    const a = myAvatar(); if (!a) return;
    cancelTask(a);
    const p = new T.Vector3(fh.point.x, 0, fh.point.z);
    if (blocked(p.x, p.z, 0.2)) { const d = fh.object.userData.dept; if (d) p.copy(spotIn(d, me?.uid || 1)); else return; }
    ctl.auto = routeToPoint(a.h.root.position, p);
    showTapMarker(p);
  }
  function showTapMarker(p) { tapMarker.position.set(p.x, 0.2, p.z); tapMarker.visible = true; tapMarker.userData.t = 0.8; }
  function resize() {
    if (!renderer || !container.clientWidth) return;
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix();
  }

  // ---------- public ----------
  window.World3D = {
    _names: {},
    supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (_) { return false; } },
    init(el, cfg, onRoomCb, send, hk) {
      if (renderer) return true;
      if (!this.supported()) return false;
      container = el; onRoom = onRoomCb; sendFn = send; hooks = hk || {};
      Object.entries(cfg.depts).forEach(([k, v]) => { this._names[k] = v.name; });
      const small = Math.min(window.innerWidth, window.innerHeight) < 500;
      renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
      renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = small ? T.PCFShadowMap : T.PCFSoftShadowMap;
      el.prepend(renderer.domElement);
      scene = new T.Scene(); scene.fog = new T.Fog(0x9CCBE8, 160, 520);
      camera = new T.PerspectiveCamera(45, 1, 0.3, 1400);
      hemi = new T.HemisphereLight(0xFFFFFF, 0x5B6B4A, 0.75); scene.add(hemi);
      sun = new T.DirectionalLight(0xFFF4E0, 1); sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536);
      Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
      sun.target.position.set(0, 0, rowZ(1)); scene.add(sun, sun.target);
      raycaster = new T.Raycaster();
      buildWorld(); makeNPCs(); bindInput(renderer.domElement); buildHud(el); loadModels();
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
      if (mode !== 'walk') { Object.assign(cam, { yaw: 0.55, pitch: 0.92, dist: 74 }); cam.target.set(5, 0, rowZ(1) + 3); Object.keys(ctl.keys).forEach((k) => { ctl.keys[k] = false; }); ctl.jx = ctl.jy = 0; }
      Object.values(roomLabels).forEach((l) => { l.visible = mode !== 'walk'; });
    },
    zoom,
    cantWork,
    focus(f) {
      if (cam.mode === 'walk') return;
      if (f === 'region') { cam.target.set(0, 0, -30); cam.dist = 330; cam.pitch = 1.05; return; }
      if (f === 'akt') { cam.target.set(5, 0, rowZ(1) + 3); cam.dist = 74; cam.pitch = 0.92; return; }
      const F = FACS[f]; if (F) { cam.target.set(F.x, 0, F.z + 2); cam.dist = 44; cam.pitch = 0.9; }
    },
    event(amount, reason) {
      if (/Unsafe prescription stopped/i.test(reason)) addMood('catch', 'Good catch!', true, 300);
      else if (amount >= 15) addMood('win', 'Saved the day', true, 300);
      else if (amount < 0 && /deteriorated|Adverse/i.test(reason)) { addMood('shaken', 'Shaken', false, 300); needs.calm -= 10; }
      if (/promoted/i.test(reason)) addMood('promo', 'Promoted!', true, 600);
      needs.calm += amount > 0 ? 1 : 0; clampNeeds(); refreshHud();
    },
    previewLook(look) {
      const a = myAvatar(); if (!a || !me) return;
      ctl.previewing = true; ctl.previewLook = look; cancelTask(a); closeMenu();
      rebuildAvatar(a, { uid: me.uid, name: me.name, role: me.role }, look);
      a.label.visible = false;
    },
    endPreview() { ctl.previewing = false; const a = myAvatar(); if (a) a.label.visible = true; },
    closeMenu,
    _test: {
      menu(kind, i = 0) { const list = interactables.filter((m) => m.userData.inter.kind === kind || (kind === 'bed-occupied' && m.userData.inter.kind === 'bed' && m.userData.inter.slot.pid)); const m = list[i]; if (!m) return false; const r = container.getBoundingClientRect(); openMenu(m.userData.inter, r.left + r.width / 2, r.top + r.height / 2); return true; },
      needs: () => ({ ...needs }), here: () => ctl.here, task: () => (ctl.task ? ctl.task.phase : null),
      setNeed(k, v) { needs[k] = v; refreshHud(); },
      look(cx, cz, d) { cam.mode = 'overview'; cam.target.set(cx, 0, cz); cam.dist = d; cam.pitch = 0.75; },
      rect: (id) => RECT[id],
      previewYaw(v) { ctl.previewYaw = v; },
      skipWalk() { const a = myAvatar(); if (!a || !ctl.auto.length) return; const last = ctl.auto[ctl.auto.length - 1]; a.h.root.position.set(last.x, 0, last.z); ctl.auto = []; },
    },
    reset() { Object.assign(cam, { yaw: 0.55, pitch: 0.92, dist: 74 }); cam.walkDist = 9; cam.walkPitch = 0.36; if (cam.mode !== 'walk') cam.target.set(5, 0, rowZ(1) + 3); },
  };
})();
