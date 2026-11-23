// Tripo/Meshy GLB'sini oyun için optimize eder: kaynak GLB depoya girmez, yalnız çıktılar game/assets/ altında.
// Kullanım: node tools/optimize_glb.mjs <kaynak.glb> <çıktı-adı> <hedefÜçgen> <doku> [jpegKalite]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, out, triStr, texStr, qStr] = process.argv.slice(2);
const target = +triStr, tex = +texStr, quality = +(qStr || 82);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
// tanınmayan/gereksiz uzantıları kaldır (FB_ngon_encoding, KHR_materials_volume)
for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose();
const tris = () => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = tris();
await doc.transform(weld({}), dedup());
await MeshoptSimplifier.ready;
const ratio = Math.min(1, target / tris());
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }), prune());
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [tex, tex], quality, slots: /baseColor|metallicRoughness|normal/ }));
const after = tris();
await io.write(out, doc);
const fs = await import('fs');
console.log(JSON.stringify({ out, before, after, bytes: fs.statSync(out).size, bounds: getBounds(doc.getRoot().getDefaultScene()) }));
