import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { USDZLoader } from 'three/addons/loaders/USDZLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';

const canvas = document.getElementById('sceneCanvas');
const fileInput = document.getElementById('fileInput');
const fitBtn = document.getElementById('fitBtn');
const autoRotateBtn = document.getElementById('autoRotateBtn');
const yAxisBtn = document.getElementById('yAxisBtn');
const envToggleBtn = document.getElementById('envToggleBtn');
const lightIntensity = document.getElementById('lightIntensity');
const lightTemp = document.getElementById('lightTemp');
const lightIntensityValueEl = document.getElementById('lightIntensityValue');
const lightTempValueEl = document.getElementById('lightTempValue');
const bgMode = document.getElementById('bgMode');
const materialToggle = document.getElementById('materialToggle');
const wireToggle = document.getElementById('wireToggle');
const dropHint = document.getElementById('dropHint');
const descToggle = document.getElementById('descToggle');
const descPanel = document.getElementById('descPanel');
const descClose = document.getElementById('descClose');
const descText = document.getElementById('descText');
const descSave = document.getElementById('descSave');
const descSaved = document.getElementById('descSaved');
const shareArBtn = document.getElementById('shareArBtn');
const arModal = document.getElementById('arModal');
const arCloseBtn = document.getElementById('arCloseBtn');
const sbUrlInput = document.getElementById('sbUrlInput');
const sbKeyInput = document.getElementById('sbKeyInput');
const arFilesLabel = document.getElementById('arFilesLabel');
const arCompatHint = document.getElementById('arCompatHint');
const uploadArBtn = document.getElementById('uploadArBtn');
const arStatus = document.getElementById('arStatus');
const arResult = document.getElementById('arResult');
const arQrImg = document.getElementById('arQrImg');
const arLinkInput = document.getElementById('arLinkInput');
const copyArLinkBtn = document.getElementById('copyArLinkBtn');
const arScanHint = document.getElementById('arScanHint');
const viewerMsg = document.getElementById('viewerMsg');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
canvas.style.touchAction = 'none';

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0f15');
scene.userData.bgMode = 'default';

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
camera.position.set(2.5, 2.2, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.2;
controls.maxDistance = 500;
controls.screenSpacePanning = false;
controls.autoRotate = false;
controls.autoRotateSpeed = 1.0;
controls.addEventListener('end', () => {
  if (!currentBounds) return;
  const dist = camera.position.distanceTo(controls.target);
  const minDist = currentBounds.radius * 0.5;
  const maxDist = currentBounds.radius * 20;
  if (!Number.isFinite(dist) || dist < minDist || dist > maxDist) {
    resetView();
  }
});

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new RoomEnvironment();
const envTexture = pmrem.fromScene(envScene).texture;
scene.environment = envTexture;
let envEnabled = true;

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(4, 6, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
fillLight.position.set(-4, 2, -2);
scene.add(fillLight);

const loader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const usdzLoader = new USDZLoader();
const textureLoader = new THREE.TextureLoader();

let currentModel = null;
let currentBounds = null;
let materialEnabled = true;
let wireframeEnabled = false;
let yAxisFlipped = false;
let lightIntensityValue = 1.0;
let lightTempValue = 6500;

if (lightIntensityValueEl) lightIntensityValueEl.textContent = lightIntensityValue.toFixed(2);
if (lightTempValueEl) lightTempValueEl.textContent = String(lightTempValue);

const neutralMaterial = new THREE.MeshStandardMaterial({
  color: 0x9aa7b3,
  metalness: 0.1,
  roughness: 0.6,
});

function normalizeFbx(object) {
  if (!object) return;
  const bounds = computeBounds(object);
  const maxSize = Math.max(bounds.size.x, bounds.size.y, bounds.size.z) || 1;
  const targetSize = 2.0;
  const scale = targetSize / maxSize;
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);
  object.rotation.x = -Math.PI / 2;
  object.updateMatrixWorld(true);
}

function setBaseTransform(object) {
  if (!object) return;
  object.userData.baseRotation = object.rotation.clone();
}

function applyYAxisFlip(object, flip) {
  if (!object || !object.userData.baseRotation) return;
  object.rotation.copy(object.userData.baseRotation);
  if (flip) {
    object.rotation.x += Math.PI;
  }
  object.updateMatrixWorld(true);
}

function setCanvasSize() {
  const { width, height } = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(setCanvasSize);
resizeObserver.observe(canvas);

function applyWireframe(material, on) {
  if (Array.isArray(material)) {
    material.forEach((mat) => applyWireframe(mat, on));
    return;
  }
  if (!material) return;
  material.wireframe = on;
  material.needsUpdate = true;
}

function kelvinToRgb(kelvin) {
  const temp = kelvin / 100;
  let red;
  let green;
  let blue;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  const clamp = (value) => Math.min(255, Math.max(0, value));
  return new THREE.Color(clamp(red) / 255, clamp(green) / 255, clamp(blue) / 255);
}

function applyLightSettings() {
  const color = kelvinToRgb(lightTempValue);
  ambient.color.copy(color);
  keyLight.color.copy(color);
  fillLight.color.copy(color);

  const lightFactor = envEnabled ? lightIntensityValue : 0;
  ambient.intensity = 0.4 * lightFactor;
  keyLight.intensity = 1.0 * lightFactor;
  fillLight.intensity = 0.6 * lightFactor;

  if (currentModel) {
    currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const applyEnv = (material) => {
        if (!material) return;
        material.envMapIntensity = envEnabled ? 1.0 * lightIntensityValue : 0.0;
        material.needsUpdate = true;
      };
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => applyEnv(mat));
      } else {
        applyEnv(child.material);
      }
    });
  }
}

function setLightControlsEnabled(enabled) {
  if (lightIntensity) lightIntensity.disabled = !enabled;
  if (lightTemp) lightTemp.disabled = !enabled;
}

setLightControlsEnabled(envEnabled);

function applyBackground(mode) {
  scene.userData.bgMode = mode;
  if (mode === 'light') {
    scene.background = new THREE.Color('#d9d9d9');
    return;
  }
  if (mode === 'dark') {
    scene.background = new THREE.Color('#30343a');
    return;
  }
  if (mode === 'gradient') {
    scene.background = createGradientTexture('#f2f4f6', '#6d737b');
    return;
  }
  scene.background = new THREE.Color('#0b0f15');
}

function createGradientTexture(topColor, bottomColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rememberOriginalMaterials(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      if (!child.userData.originalMaterial) {
        child.userData.originalMaterial = child.material;
      }
    }
  });
}

function swapMaterials(object, enabled) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.userData.originalMaterial) {
      child.userData.originalMaterial = child.material;
    }
    if (enabled) {
      child.material = child.userData.originalMaterial;
    } else {
      child.material = neutralMaterial;
    }
    applyWireframe(child.material, wireframeEnabled);
  });
}

function computeBounds(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const radius = size.length() * 0.5 || 1;
  return { box, size, center, radius };
}

function fitCameraToBounds(bounds) {
  if (!bounds) return;
  const { center, radius } = bounds;
  const fitOffset = 1.4;
  const distance = radius * fitOffset / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const direction = new THREE.Vector3(1, 0.8, 1).normalize();
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
  controls.target.copy(center);
  updateCameraClipping(bounds);
  controls.update();
}

function setView(view) {
  if (!currentBounds) return;
  const { center, radius } = currentBounds;
  const dist = radius * 2.2;
  const positions = {
    perspective: new THREE.Vector3(1, 0.8, 1),
    front: new THREE.Vector3(0, 0, 1),
    back: new THREE.Vector3(0, 0, -1),
    left: new THREE.Vector3(-1, 0, 0),
    right: new THREE.Vector3(1, 0, 0),
    top: new THREE.Vector3(0, 1, 0),
    bottom: new THREE.Vector3(0, -1, 0),
  };
  const dir = positions[view] || positions.perspective;
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  controls.target.copy(center);
  updateCameraClipping(currentBounds);
  controls.update();
}

function updateCameraClipping(bounds) {
  if (!bounds) return;
  const radius = bounds.radius || 1;
  camera.near = Math.max(radius / 100, 0.01);
  camera.far = Math.max(radius * 100, 50);
  camera.updateProjectionMatrix();
}

function clearModel() {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.dispose();
      }
    });
  }
  currentModel = null;
  currentBounds = null;
}

function loadGltfFromUrl(url) {
  setViewerMsg('Loading model...', 'hint-info');
  loader.load(
    url,
    (gltf) => {
      clearModel();
      currentModel = gltf.scene;
      setBaseTransform(currentModel);
      applyYAxisFlip(currentModel, yAxisFlipped);
      rememberOriginalMaterials(currentModel);
      swapMaterials(currentModel, materialEnabled);
      scene.add(currentModel);
      currentBounds = computeBounds(currentModel);
      fitCameraToBounds(currentBounds);
      applyLightSettings();
      setViewerMsg('', 'hint-info');
    },
    undefined,
    (error) => {
      console.error('Failed to load model', error);
      setViewerMsg(`Model load failed: ${error?.message || String(error)}`, 'hint-err');
    }
  );
}

function loadGltfWithFiles(gltfFile, files) {
  setViewerMsg('Loading model...', 'hint-info');
  const basePath = getBasePath(gltfFile);
  const { manager, objectUrls } = createFileManager(files, basePath);

  const scopedLoader = new GLTFLoader(manager);
  const reader = new FileReader();
  reader.onload = () => {
    const gltfText = reader.result;
    scopedLoader.parse(
      gltfText,
      '',
      (gltf) => {
        clearModel();
        currentModel = gltf.scene;
        setBaseTransform(currentModel);
        applyYAxisFlip(currentModel, yAxisFlipped);
        rememberOriginalMaterials(currentModel);
        swapMaterials(currentModel, materialEnabled);
        scene.add(currentModel);
        currentBounds = computeBounds(currentModel);
        fitCameraToBounds(currentBounds);
        applyLightSettings();
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        setViewerMsg('', 'hint-info');
      },
      (error) => {
        console.error('Failed to parse GLTF', error);
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        setViewerMsg(`Model load failed: ${error?.message || String(error)}`, 'hint-err');
      }
    );
  };
  reader.onerror = () => {
    console.error('Failed to read GLTF file');
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    setViewerMsg('Failed to read GLTF file.', 'hint-err');
  };
  reader.readAsText(gltfFile);
}

function loadFbxFromUrl(url) {
  setViewerMsg('Loading model...', 'hint-info');
  fbxLoader.load(
    url,
    (object) => {
      clearModel();
      currentModel = object;
      normalizeFbx(currentModel);
      setBaseTransform(currentModel);
      applyYAxisFlip(currentModel, yAxisFlipped);
      rememberOriginalMaterials(currentModel);
      swapMaterials(currentModel, materialEnabled);
      scene.add(currentModel);
      currentBounds = computeBounds(currentModel);
      fitCameraToBounds(currentBounds);
      applyLightSettings();
      setViewerMsg('', 'hint-info');
    },
    undefined,
    (error) => {
      console.error('Failed to load FBX', error);
      setViewerMsg(`Model load failed: ${error?.message || String(error)}`, 'hint-err');
    }
  );
}

function loadFbxWithFiles(fbxFile, files) {
  setViewerMsg('Loading model...', 'hint-info');
  const basePath = getBasePath(fbxFile);
  const { manager, objectUrls } = createFileManager(files, basePath);
  const scopedLoader = new FBXLoader(manager);
  const url = URL.createObjectURL(fbxFile);
  objectUrls.push(url);
  scopedLoader.load(
    url,
    (object) => {
      clearModel();
      currentModel = object;
      normalizeFbx(currentModel);
      setBaseTransform(currentModel);
      applyYAxisFlip(currentModel, yAxisFlipped);
      autoApplyPbrTextures(currentModel, files);
      rememberOriginalMaterials(currentModel);
      swapMaterials(currentModel, materialEnabled);
      scene.add(currentModel);
      currentBounds = computeBounds(currentModel);
      fitCameraToBounds(currentBounds);
      applyLightSettings();
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      setViewerMsg('', 'hint-info');
    },
    undefined,
    (error) => {
      console.error('Failed to load FBX', error);
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      setViewerMsg(`Model load failed: ${error?.message || String(error)}`, 'hint-err');
    }
  );
}

async function diagnoseUsdzFile(file) {
  const warnings = [];
  const errors = [];
  if (!file) {
    errors.push('No USDZ file selected.');
    return { ok: false, warnings, errors };
  }
  if (!file.name.toLowerCase().endsWith('.usdz')) {
    errors.push('File extension is not .usdz.');
    return { ok: false, warnings, errors };
  }
  if (file.size <= 0) {
    errors.push('USDZ file is empty.');
    return { ok: false, warnings, errors };
  }
  if (file.size > 80 * 1024 * 1024) {
    warnings.push('Large USDZ file; mobile AR may fail due to memory limits.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) {
    errors.push('USDZ is too small to be a valid archive.');
    return { ok: false, warnings, errors };
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    errors.push('USDZ must be a ZIP archive (missing PK signature).');
    return { ok: false, warnings, errors };
  }

  const scanLength = Math.min(bytes.length, 2 * 1024 * 1024);
  const ascii = new TextDecoder('latin1').decode(bytes.slice(0, scanLength));
  if (!ascii.includes('.usdc') && !ascii.includes('.usda')) {
    warnings.push('Could not find .usdc/.usda entries near archive header.');
  }
  if (ascii.includes('__MACOSX/')) {
    warnings.push('Archive includes macOS metadata folders; this can break some USDZ readers.');
  }

  return { ok: errors.length === 0, warnings, errors, buffer };
}

async function loadUsdzFile(file) {
  setViewerMsg('Checking USDZ file...', 'hint-info');
  try {
    const report = await diagnoseUsdzFile(file);
    if (!report.ok) {
      setViewerMsg(`USDZ check failed: ${report.errors.join(' ')}`, 'hint-err');
      return;
    }
    if (report.warnings.length) {
      setViewerMsg(`USDZ warnings: ${report.warnings.join(' ')} Loading anyway...`, 'hint-warn');
    } else {
      setViewerMsg('Loading USDZ model...', 'hint-info');
    }

    let object;
    try {
      object = usdzLoader.parse(report.buffer);
    } catch (parseError) {
      const reason = parseError?.message || String(parseError);
      setViewerMsg(
        `USDZ parse failed: ${reason}. Common causes: unsupported USDZ variant, compressed ZIP entries, or incompatible material data.`,
        'hint-err'
      );
      return;
    }

    if (!object) {
      setViewerMsg('USDZ parse returned empty scene.', 'hint-err');
      return;
    }

    clearModel();
    currentModel = object;
    setBaseTransform(currentModel);
    applyYAxisFlip(currentModel, yAxisFlipped);
    rememberOriginalMaterials(currentModel);
    swapMaterials(currentModel, materialEnabled);
    scene.add(currentModel);
    currentBounds = computeBounds(currentModel);
    fitCameraToBounds(currentBounds);
    applyLightSettings();

    if (report.warnings.length) {
      setViewerMsg(`USDZ loaded with warnings: ${report.warnings.join(' ')}`, 'hint-warn');
    } else {
      setViewerMsg('USDZ loaded successfully.', 'hint-ok');
    }
  } catch (error) {
    console.error('Failed to load USDZ', error);
    setViewerMsg(`USDZ load failed: ${error?.message || String(error)}`, 'hint-err');
  }
}

function autoApplyPbrTextures(object, files) {
  if (!object || !files || !files.length) return;

  const textureFiles = files.filter((file) => file.name.toLowerCase().endsWith('.png'));
  if (!textureFiles.length) return;

  const textureSets = buildTextureSets(textureFiles);
  if (!textureSets.size) return;

  const meshInfos = [];
  object.traverse((child) => {
    if (child.isMesh) {
      meshInfos.push({ mesh: child, name: (child.name || '').toLowerCase(), materialName: (child.material?.name || '').toLowerCase() });
    }
  });

  const hasAnyMap = meshInfos.some(({ mesh }) => {
    const mat = mesh.material;
    return Array.isArray(mat)
      ? mat.some((m) => m && (m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.aoMap))
      : mat && (mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap || mat.aoMap);
  });

  if (hasAnyMap) return;

  const textureKeys = Array.from(textureSets.keys());
  const fallbackKey = textureKeys.length === 1 ? textureKeys[0] : '';

  meshInfos.forEach(({ mesh, name, materialName }) => {
    const key = pickBestTextureKey(textureKeys, materialName, name) || fallbackKey;
    if (!key) return;
    const set = textureSets.get(key);
    applyTextureSetToMaterial(mesh, set);
  });
}

function buildTextureSets(textureFiles) {
  const sets = new Map();
  const suffixes = [
    { key: 'baseColor', patterns: ['basecolor', 'albedo', 'diffuse'] },
    { key: 'normal', patterns: ['normal', 'nrm', 'nor'] },
    { key: 'orm', patterns: ['occlusionroughnessmetallic', 'orm'] },
    { key: 'roughness', patterns: ['roughness'] },
    { key: 'metalness', patterns: ['metallic', 'metalness'] },
    { key: 'ao', patterns: ['occlusion', 'ao'] },
  ];

  textureFiles.forEach((file) => {
    const lower = file.name.toLowerCase();
    let found = null;
    for (const entry of suffixes) {
      for (const pattern of entry.patterns) {
        if (lower.includes(pattern)) {
          found = entry.key;
          break;
        }
      }
      if (found) break;
    }
    if (!found) return;
    const base = stripTextureSuffix(lower);
    if (!sets.has(base)) sets.set(base, {});
    sets.get(base)[found] = file;
  });

  return sets;
}

function stripTextureSuffix(name) {
  const patterns = [
    'basecolor',
    'albedo',
    'diffuse',
    'normal',
    'nrm',
    'nor',
    'occlusionroughnessmetallic',
    'orm',
    'roughness',
    'metallic',
    'metalness',
    'occlusion',
    'ao',
  ];
  let base = name.replace(/\.[^/.]+$/, '');
  patterns.forEach((pattern) => {
    const regex = new RegExp(`([_\\-.]|__)?${pattern}$`, 'i');
    base = base.replace(regex, '');
  });
  return base;
}

function pickBestTextureKey(keys, materialName, meshName) {
  const candidates = [materialName, meshName].filter(Boolean);
  for (const candidate of candidates) {
    for (const key of keys) {
      if (key === candidate) return key;
      if (candidate.includes(key) || key.includes(candidate)) return key;
    }
  }
  return '';
}

function applyTextureSetToMaterial(mesh, set) {
  const applyToMaterial = (material) => {
    if (!material || !set) return;
    if (set.baseColor) {
      material.map = textureLoader.load(URL.createObjectURL(set.baseColor));
      material.map.colorSpace = THREE.SRGBColorSpace;
    }
    if (set.normal) {
      material.normalMap = textureLoader.load(URL.createObjectURL(set.normal));
      material.normalMap.colorSpace = THREE.NoColorSpace;
    }
    if (set.orm) {
      const orm = textureLoader.load(URL.createObjectURL(set.orm));
      orm.colorSpace = THREE.NoColorSpace;
      material.aoMap = orm;
      material.roughnessMap = orm;
      material.metalnessMap = orm;
      material.aoMapIntensity = 1.0;
      material.roughness = 1.0;
      material.metalness = 1.0;
      ensureUv2(mesh);
    } else {
      if (set.roughness) {
        material.roughnessMap = textureLoader.load(URL.createObjectURL(set.roughness));
        material.roughnessMap.colorSpace = THREE.NoColorSpace;
        material.roughness = 1.0;
      }
      if (set.metalness) {
        material.metalnessMap = textureLoader.load(URL.createObjectURL(set.metalness));
        material.metalnessMap.colorSpace = THREE.NoColorSpace;
        material.metalness = 1.0;
      }
      if (set.ao) {
        material.aoMap = textureLoader.load(URL.createObjectURL(set.ao));
        material.aoMap.colorSpace = THREE.NoColorSpace;
        material.aoMapIntensity = 1.0;
        ensureUv2(mesh);
      }
    }
    material.needsUpdate = true;
  };

  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((mat) => applyToMaterial(mat));
  } else {
    applyToMaterial(mesh.material);
  }
}

function ensureUv2(mesh) {
  if (!mesh.geometry || !mesh.geometry.attributes || mesh.geometry.attributes.uv2) return;
  const uv = mesh.geometry.attributes.uv;
  if (!uv) return;
  mesh.geometry.setAttribute('uv2', new THREE.BufferAttribute(uv.array, 2));
}

function getBasePath(file) {
  if (!file || !file.webkitRelativePath) return '';
  const normalized = file.webkitRelativePath.replace(/\\\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(0, idx + 1) : '';
}

function createFileManager(files, basePath = '') {
  const manager = new THREE.LoadingManager();
  const urlMap = new Map();
  const objectUrls = [];

  const addMapping = (key, value) => {
    if (!key) return;
    urlMap.set(key, value);
    urlMap.set(key.toLowerCase(), value);
  };

  files.forEach((file) => {
    const objectUrl = URL.createObjectURL(file);
    objectUrls.push(objectUrl);
    addMapping(file.name, objectUrl);
    if (file.webkitRelativePath) {
      addMapping(file.webkitRelativePath.replace(/\\\\/g, '/'), objectUrl);
    }
  });

  const normalizePath = (path) => {
    const parts = path.replace(/\\\\/g, '/').split('/');
    const stack = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (stack.length) stack.pop();
        continue;
      }
      stack.push(part);
    }
    return stack.join('/');
  };

  const resolveUrl = (url) => {
    const cleanUrl = url.split('?')[0].replace(/\\\\/g, '/');
    const normalized = normalizePath(cleanUrl);
    const decoded = normalizePath(decodeURIComponent(normalized));
    const decodedLower = decoded.toLowerCase();

    const withBase = basePath ? normalizePath(`${basePath}${decoded}`) : decoded;
    const withBaseLower = basePath ? normalizePath(`${basePath}${decodedLower}`) : decodedLower;
    if (urlMap.has(decoded)) return urlMap.get(decoded);
    if (urlMap.has(decodedLower)) return urlMap.get(decodedLower);
    if (basePath && urlMap.has(withBase)) return urlMap.get(withBase);
    if (basePath && urlMap.has(withBaseLower)) return urlMap.get(withBaseLower);

    const basename = decoded.split('/').pop();
    const basenameLower = basename ? basename.toLowerCase() : '';
    if (urlMap.has(basename)) return urlMap.get(basename);
    if (basenameLower && urlMap.has(basenameLower)) return urlMap.get(basenameLower);
    return url;
  };

  manager.setURLModifier((url) => resolveUrl(url));
  manager.onError = (url) => {
    console.warn('Missing resource:', url);
  };
  return { manager, objectUrls };
}

function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const usdzFile = files.find((file) => file.name.toLowerCase().endsWith('.usdz'));
  const gltfFile = files.find((file) => file.name.toLowerCase().endsWith('.gltf'));
  const glbFile = files.find((file) => file.name.toLowerCase().endsWith('.glb'));
  const fbxFile = files.find((file) => file.name.toLowerCase().endsWith('.fbx'));

  // Track AR-compatible assets from the same upload selection.
  arGlbFile = glbFile || null;
  arUsdzFile = usdzFile || null;
  lastUploadLabel = (gltfFile || glbFile || fbxFile || usdzFile || files[0]).name;
  updateArFilesLabel();

  if (gltfFile) {
    loadGltfWithFiles(gltfFile, files);
    return;
  }

  if (glbFile) {
    const url = URL.createObjectURL(glbFile);
    loadGltfFromUrl(url);
    return;
  }

  if (fbxFile) {
    if (files.length > 1) {
      loadFbxWithFiles(fbxFile, files);
      return;
    }
    const url = URL.createObjectURL(fbxFile);
    loadFbxFromUrl(url);
    return;
  }

  if (usdzFile) {
    loadUsdzFile(usdzFile);
    return;
  }

  console.warn('Preview supports GLB/GLTF/FBX/USDZ.');
  setViewerMsg('Unsupported model format. Please upload GLB/GLTF/FBX/USDZ.', 'hint-err');
}

fileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files);
  fileInput.value = '';
});

function setActiveViewButton(view) {
  viewButtons.forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

function resetView() {
  setActiveViewButton('perspective');
  setView('perspective');
  fitCameraToBounds(currentBounds);
}

fitBtn.addEventListener('click', () => resetView());

autoRotateBtn.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  autoRotateBtn.textContent = controls.autoRotate ? 'Stop Rotate' : 'Auto Rotate';
});

yAxisBtn.addEventListener('click', () => {
  yAxisFlipped = !yAxisFlipped;
  yAxisBtn.textContent = yAxisFlipped ? 'Y+ Fixed' : 'Fix Y+';
  if (currentModel) {
    applyYAxisFlip(currentModel, yAxisFlipped);
    currentBounds = computeBounds(currentModel);
    fitCameraToBounds(currentBounds);
  }
});

envToggleBtn.addEventListener('click', () => {
  envEnabled = !envEnabled;
  envToggleBtn.textContent = envEnabled ? 'Env Light: On' : 'Env Light: Off';
  scene.environment = envEnabled ? envTexture : null;
  setLightControlsEnabled(envEnabled);
  applyLightSettings();
});

lightIntensity.addEventListener('input', () => {
  lightIntensityValue = Number(lightIntensity.value);
  lightIntensityValueEl.textContent = lightIntensityValue.toFixed(2);
  applyLightSettings();
});

lightTemp.addEventListener('input', () => {
  lightTempValue = Number(lightTemp.value);
  lightTempValueEl.textContent = String(lightTempValue);
  applyLightSettings();
});

materialToggle.addEventListener('change', () => {
  materialEnabled = materialToggle.checked;
  const label = materialToggle.closest('.hud-group').querySelector('.switch-label');
  label.textContent = materialEnabled ? 'On' : 'Off';
  if (currentModel) swapMaterials(currentModel, materialEnabled);
});

wireToggle.addEventListener('change', () => {
  wireframeEnabled = wireToggle.checked;
  const label = wireToggle.closest('.hud-group').querySelector('.switch-label');
  label.textContent = wireframeEnabled ? 'On' : 'Off';
  if (currentModel) {
    currentModel.traverse((child) => {
      if (child.isMesh) applyWireframe(child.material, wireframeEnabled);
    });
  }
});

const viewButtons = document.querySelectorAll('[data-view]');
viewButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveViewButton(btn.dataset.view);
    setView(btn.dataset.view);
  });
});

const bgButtons = bgMode ? bgMode.querySelectorAll('[data-bg]') : [];
const setActiveBg = (value) => {
  bgButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.bg === value);
  });
};
setActiveBg('default');

bgButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.bg;
    setActiveBg(mode);
    applyBackground(mode);
  });
});

function showDescPanel(show) {
  descPanel.classList.toggle('show', show);
}

descToggle.addEventListener('click', () => showDescPanel(!descPanel.classList.contains('show')));
descClose.addEventListener('click', () => showDescPanel(false));

const descStorageKey = 'model-viewer-description';
descText.value = localStorage.getItem(descStorageKey) || '';

function flashSaved() {
  descSaved.classList.add('show');
  clearTimeout(flashSaved._timer);
  flashSaved._timer = setTimeout(() => descSaved.classList.remove('show'), 1200);
}

descSave.addEventListener('click', () => {
  localStorage.setItem(descStorageKey, descText.value);
  flashSaved();
});

let arGlbFile = null;
let arUsdzFile = null;
let lastUploadLabel = '';

function normalizeSbUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function setHintClass(el, kind) {
  if (!el) return;
  el.classList.remove('hint-info', 'hint-warn', 'hint-ok', 'hint-err');
  if (kind) el.classList.add(kind);
}

function setViewerMsg(text, kind = 'hint-info') {
  if (!viewerMsg) return;
  if (!text) {
    viewerMsg.classList.add('hidden');
    viewerMsg.textContent = '';
    return;
  }
  viewerMsg.classList.remove('hidden');
  viewerMsg.textContent = text;
  setHintClass(viewerMsg, kind);
}

function setArStatus(text, kind = 'hint-info') {
  if (arStatus) arStatus.textContent = text || '';
  setHintClass(arStatus, kind);
}

function setModalOpen(open) {
  if (!arModal) return;
  arModal.classList.toggle('hidden', !open);
  arModal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function updateArFilesLabel() {
  if (!arFilesLabel) return;
  const names = [];
  if (lastUploadLabel) names.push(lastUploadLabel);
  if (arGlbFile?.name && arGlbFile.name !== lastUploadLabel) names.push(arGlbFile.name);
  if (arUsdzFile?.name && arUsdzFile.name !== lastUploadLabel) names.push(arUsdzFile.name);
  arFilesLabel.textContent = names.length ? names.join(' | ') : 'No model uploaded yet.';

  if (arCompatHint) {
    const okAndroid = !!arGlbFile;
    const okIos = !!arUsdzFile;
    if (uploadArBtn) uploadArBtn.disabled = !okAndroid && !okIos;
    if (!okAndroid && !okIos) {
      setHintClass(arCompatHint, 'hint-warn');
      arCompatHint.textContent = 'AR not ready: upload a GLB (Android) and/or USDZ (iOS) using “Upload Model”.';
    } else if (okAndroid && okIos) {
      setHintClass(arCompatHint, 'hint-ok');
      arCompatHint.textContent = 'AR ready: Android (GLB) and iOS (USDZ) are both supported.';
    } else if (okAndroid) {
      setHintClass(arCompatHint, 'hint-warn');
      arCompatHint.textContent = 'AR partially ready: Android is supported (GLB), add USDZ for better iOS AR.';
    } else {
      setHintClass(arCompatHint, 'hint-warn');
      arCompatHint.textContent = 'AR partially ready: iOS is supported (USDZ), add GLB for Android WebXR.';
    }
  }
}

function setArResult(url, qrDataUrl) {
  if (arResult) arResult.classList.toggle('hidden', !url);
  if (arLinkInput) arLinkInput.value = url || '';
  if (arQrImg) arQrImg.src = qrDataUrl || '';
  if (arScanHint) {
    arScanHint.textContent = url
      ? 'Scan tips: iOS use the default Camera app. Android use Camera or Google Lens, or open the link in Chrome.'
      : '';
    setHintClass(arScanHint, 'hint-info');
  }
}

function getQrApi() {
  if (QRCode && typeof QRCode.toDataURL === 'function') return QRCode;
  if (QRCode && QRCode.default && typeof QRCode.default.toDataURL === 'function') return QRCode.default;
  return null;
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function extOf(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

async function uploadForAr() {
  const sbUrl = normalizeSbUrl(sbUrlInput?.value);
  const sbKey = String(sbKeyInput?.value || '').trim();
  const bucket = 'models';

  if (!sbUrl || !/^https?:\/\//i.test(sbUrl)) {
    setArStatus('请填写有效的 Supabase 项目 URL。', 'hint-err');
    return;
  }
  if (!sbKey || !sbKey.startsWith('sb_')) {
    setArStatus('请填写有效的 Supabase 公钥（Publishable Key）。', 'hint-err');
    return;
  }

  localStorage.setItem('sbUrl', sbUrl);
  localStorage.setItem('sbKey', sbKey);

  if (!arGlbFile && !arUsdzFile) {
    setArStatus(
      '当前上传不满足 AR 要求：Android 需要 .glb，iOS 建议 .usdz。请先通过“上传模型”上传后再生成二维码。',
      'hint-warn'
    );
    return;
  }
  if (arGlbFile && extOf(arGlbFile.name) !== 'glb') {
    setArStatus('GLB 文件后缀必须为 .glb。', 'hint-err');
    return;
  }
  if (arUsdzFile && extOf(arUsdzFile.name) !== 'usdz') {
    setArStatus('USDZ 文件后缀必须为 .usdz。', 'hint-err');
    return;
  }

  setArStatus('正在上传到 Supabase Storage...', 'hint-info');
  setArResult('', '');
  uploadArBtn.disabled = true;

  try {
    const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
    const id = randomId();

    const paths = {
      glb: arGlbFile ? `${id}/model.glb` : '',
      usdz: arUsdzFile ? `${id}/model.usdz` : '',
      manifest: `manifests/${id}.json`,
    };

    if (arGlbFile) {
      setArStatus('正在上传 GLB...', 'hint-info');
      const { error } = await supabase.storage.from(bucket).upload(paths.glb, arGlbFile, {
        upsert: false,
        contentType: 'model/gltf-binary',
        cacheControl: '3600',
      });
      if (error) throw error;
    }

    if (arUsdzFile) {
      setArStatus('正在上传 USDZ...', 'hint-info');
      const { error } = await supabase.storage.from(bucket).upload(paths.usdz, arUsdzFile, {
        upsert: false,
        contentType: 'model/vnd.usdz+zip',
        cacheControl: '3600',
      });
      if (error) throw error;
    }

    const urls = {};
    if (paths.glb) urls.glb = supabase.storage.from(bucket).getPublicUrl(paths.glb).data.publicUrl;
    if (paths.usdz) urls.usdz = supabase.storage.from(bucket).getPublicUrl(paths.usdz).data.publicUrl;

    const manifest = {
      id,
      createdAt: new Date().toISOString(),
      bucket,
      urls,
    };

    setArStatus('正在写入清单...', 'hint-info');
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    {
      const { error } = await supabase.storage.from(bucket).upload(paths.manifest, manifestBlob, {
        upsert: false,
        contentType: 'application/json',
        cacheControl: 'no-store',
      });
      if (error) throw error;
    }

    const arUrl = new URL('ar.html', location.href);
    arUrl.searchParams.set('id', id);
    arUrl.searchParams.set('sb', sbUrl);
    arUrl.searchParams.set('bucket', bucket);

    const qrApi = getQrApi();
    if (!qrApi) throw new Error('QR library not available');
    setArStatus('正在生成二维码...', 'hint-info');
    const qrDataUrl = await qrApi.toDataURL(arUrl.toString(), { margin: 1, width: 360 });

    setArResult(arUrl.toString(), qrDataUrl);
    setArStatus('已完成，可扫码进入 AR。', 'hint-ok');
  } catch (err) {
    setArStatus(`错误：${String(err && err.message ? err.message : err)}`, 'hint-err');
  } finally {
    uploadArBtn.disabled = false;
  }
}

shareArBtn?.addEventListener('click', () => {
  const savedUrl = localStorage.getItem('sbUrl') || '';
  const savedKey = localStorage.getItem('sbKey') || '';
  if (sbUrlInput && !sbUrlInput.value) sbUrlInput.value = savedUrl;
  if (sbKeyInput && !sbKeyInput.value) sbKeyInput.value = savedKey;
  setArStatus('');
  setArResult('', '');
  updateArFilesLabel();
  setModalOpen(true);
});

sbUrlInput?.addEventListener('input', () => {
  const v = normalizeSbUrl(sbUrlInput.value);
  if (v) localStorage.setItem('sbUrl', v);
});

sbKeyInput?.addEventListener('input', () => {
  const v = String(sbKeyInput.value || '').trim();
  if (v) localStorage.setItem('sbKey', v);
});

arCloseBtn?.addEventListener('click', () => setModalOpen(false));
arModal?.addEventListener('click', (e) => {
  if (e.target && e.target.dataset && e.target.dataset.close) setModalOpen(false);
});

uploadArBtn?.addEventListener('click', () => uploadForAr());

copyArLinkBtn?.addEventListener('click', async () => {
  const v = arLinkInput?.value;
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    setArStatus('已复制。', 'hint-ok');
    setTimeout(() => setArStatus(''), 900);
  } catch {
    setArStatus('复制失败，请长按链接手动复制。', 'hint-err');
  }
});

function setupDragAndDrop() {
  const viewer = document.querySelector('.viewer');
  const prevent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  ['dragenter', 'dragover'].forEach((type) => {
    viewer.addEventListener(type, (event) => {
      prevent(event);
      viewer.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    viewer.addEventListener(type, (event) => {
      prevent(event);
      viewer.classList.remove('dragging');
    });
  });
  viewer.addEventListener('drop', async (event) => {
    const items = event.dataTransfer.items;
    if (items && items.length) {
      const entries = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
      if (entries.length) {
        const files = await readEntries(entries);
        handleFiles(files);
        return;
      }
    }
    handleFiles(event.dataTransfer.files);
  });
}

setupDragAndDrop();

async function readEntries(entries) {
  const files = [];

  async function walk(entry, pathPrefix = '') {
    if (entry.isFile) {
      await new Promise((resolve, reject) => {
        entry.file(
          (file) => {
            if (pathPrefix) {
              Object.defineProperty(file, 'webkitRelativePath', {
                value: `${pathPrefix}${file.name}`,
              });
            }
            files.push(file);
            resolve();
          },
          (error) => reject(error)
        );
      });
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise((resolve, reject) => {
        const readBatch = () => {
          reader.readEntries(
            async (batch) => {
              if (!batch.length) {
                resolve();
                return;
              }
              for (const child of batch) {
                await walk(child, `${pathPrefix}${entry.name}/`);
              }
              readBatch();
            },
            (error) => reject(error)
          );
        };
        readBatch();
      });
    }
  }

  for (const entry of entries) {
    await walk(entry, '');
  }
  return files;
}

function addPlaceholder() {
  const geometry = new THREE.TorusKnotGeometry(0.5, 0.18, 180, 24);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6cc6ff,
    metalness: 0.35,
    roughness: 0.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.userData.originalMaterial = material;
  const group = new THREE.Group();
  group.add(mesh);
  currentModel = group;
  setBaseTransform(currentModel);
  applyYAxisFlip(currentModel, yAxisFlipped);
  scene.add(currentModel);
  currentBounds = computeBounds(currentModel);
  fitCameraToBounds(currentBounds);
  applyLightSettings();
}

addPlaceholder();

function animate() {
  requestAnimationFrame(animate);
  if (!Number.isFinite(camera.position.length())) {
    resetView();
  }
  controls.update();
  renderer.render(scene, camera);
}

setCanvasSize();
animate();
