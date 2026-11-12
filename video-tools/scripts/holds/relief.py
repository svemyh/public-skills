"""m186 (9 frames): the Everest massif as a white plaster relief model on a pale
studio sweep, built from real elevation data (AWS Terrain Tiles / Mapzen terrarium,
SRTM and other public sources, ~75 m per sample) with no vertical exaggeration
beyond 1.6x, lit by a low raking light like a museum terrain model.

blender -b -P relief.py -- <everest.npy> <out_dir> [samples]"""
import sys, os, math, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import studio
bpy = studio.bpy

args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[0], args[1]
samples = int(args[2]) if len(args) > 2 else 128
s = studio.reset(samples=samples)
E = np.load(src).astype(np.float64)
ny, nx = E.shape
W = 2.4                                   # model width in scene units
px = W / nx                               # ~75 m per sample
H = (E - E.min()) / 75.0 * px * 1.6       # metres -> samples -> units, 1.6x
base = 0.06
X, Y = np.meshgrid(np.arange(nx) * px - W / 2, (ny - 1 - np.arange(ny)) * px - ny * px / 2)
verts = np.stack([X, Y, H + base], -1).reshape(-1, 3)
idx = np.arange(nx * ny).reshape(ny, nx)
quads = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], -1).reshape(-1, 4)
# side walls and bottom: an extruded border so the model reads as a cast block
ring = np.concatenate([idx[0, :], idx[1:, -1], idx[-1, -2::-1], idx[-2:0:-1, 0]])
bot = verts[ring].copy()
bot[:, 2] = 0
v_all = np.concatenate([verts, bot])
n0 = len(verts)
walls = [[ring[i], ring[(i + 1) % len(ring)], n0 + (i + 1) % len(ring), n0 + i] for i in range(len(ring))]
me = bpy.data.meshes.new("relief")
me.from_pydata(v_all.tolist(), [], quads.tolist() + walls + [list(range(n0 + len(ring) - 1, n0 - 1, -1))])
me.update()
o = bpy.data.objects.new("relief", me)
bpy.context.collection.objects.link(o)
for p in me.polygons:
    p.use_smooth = True
m = bpy.data.materials.new("plaster")
m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.93, 0.925, 0.91, 1)
b.inputs["Roughness"].default_value = 0.85
b.inputs["Subsurface Weight"].default_value = 0.08
me.materials.append(m)

BG = (0.86, 0.86, 0.855)
studio.world(bg=BG, light=0.08)
studio.floor(BG, z=0)
studio.camera((0.9, -2.9, 2.6), (0.0, 0.05, 0.05), lens=45)
sun = bpy.data.lights.new("sun", "SUN")
sun.energy, sun.angle = 4.0, math.radians(2.5)
so = bpy.data.objects.new("sun", sun)
bpy.context.collection.objects.link(so)
so.rotation_euler = (math.radians(76), 0, math.radians(-120))   # low, from the upper left
studio.area("fill", (2, -3, 2), size=4, energy=120)
s.render.filepath = os.path.join(out, "f")
bpy.ops.render.render(animation=True)
