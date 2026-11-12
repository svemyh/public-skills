"""m055 (4 frames): the diamond crystal structure (carbon, a = 3.567 Angstrom), a slab of
unit cells receding across a white ground, bonds as cobalt rods and atoms as small
glossy spheres: the original reel's blue wire lattice, built from the real geometry.

blender -b -P lattice.py -- <out_dir> [samples]"""
import sys, os, math, itertools, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import studio

args = sys.argv[sys.argv.index("--") + 1:]
out = args[0]
samples = int(args[1]) if len(args) > 1 else 96
A = 3.567
basis = np.array([[0, 0, 0], [0, .5, .5], [.5, 0, .5], [.5, .5, 0],
                  [.25, .25, .25], [.25, .75, .75], [.75, .25, .75], [.75, .75, .25]])
NX, NY, NZ = 14, 9, 2
cells = np.array(list(itertools.product(range(NX), range(NY), range(NZ))))
X = ((cells[:, None, :] + basis[None]) * A).reshape(-1, 3)
X = np.unique(np.round(X, 4), axis=0)
# bonds: each atom of the second sublattice joins four first-sublattice atoms along <111>
key = lambda p: tuple(np.round(p / A * 4).astype(int))
have = {key(p) for p in X}
dirs = np.array([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]) * A / 4
bonds = []
for p in X:
    f = np.round(p / A * 4) % 4
    if not np.all(f % 2 == 1):
        continue
    for d in dirs:
        q = p - d
        if key(q) in have:
            bonds.append((p, q))
B = np.array(bonds)
print("atoms", len(X), "bonds", len(B))
c = X.mean(0)
S = 1 / 10.0
X = (X - c) * S
B = (B - c) * S
# rods: two-point curves, densified so the hair curve stays straight
t = np.linspace(0, 1, 4)[None, :, None]
pts = (B[:, :1] * (1 - t) + B[:, 1:] * t).reshape(-1, 3)
off = np.arange(0, len(pts) + 1, 4)
COB = np.array([0.008, 0.025, 0.32])

s = studio.reset(samples=samples)
studio.world(bg=(0.90, 0.90, 0.905), light=0.6)
rods = studio.fibres(pts, off, np.tile(COB, (len(pts), 1)), radius=0.0055)
m = studio.attr_material(rough=0.25)
m.node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.6
rods.data.materials.append(m)
atoms = studio.points(X, 0.014, np.tile([0.012, 0.04, 0.40], (len(X), 1)).astype(np.float32))
studio.set_points_material(atoms, m)
cam = studio.camera((-2.3, -0.35, 0.8), (0.35, 0.1, -0.12), lens=38)
cam.data.dof.use_dof = True
cam.data.dof.focus_distance = 2.0
cam.data.dof.aperture_fstop = 2.0
studio.area("key", (-2, -3, 4), size=5, energy=900)
studio.area("rim", (3, 3, 2), size=4, energy=400)
s.render.filepath = os.path.join(out, "f")
studio.bpy.ops.render.render(animation=True)
