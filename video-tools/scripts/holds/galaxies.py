"""m177 (4 frames): render one snapshot of sim_galaxies.py, two galaxies after a close
pass, the tidal bridge and tails drawn by 100,000 simulated stars on black. Stars
born near a core glow warm, outer-disc stars blue, as in real spirals.

blender -b -P galaxies.py -- <gal.npz> <out_dir> [snapshot] [samples]"""
import sys, os, math, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import studio

args = sys.argv[sys.argv.index("--") + 1:]
npz, out = args[0], args[1]
snap = args[2] if len(args) > 2 else "P2200"
samples = int(args[3]) if len(args) > 3 else 64
d = np.load(npz)
P, r0 = d[snap], d["r0"]
P = P - np.median(P, 0)
P /= 5.0
warm, blue = np.array([1.0, 0.78, 0.5]), np.array([0.45, 0.62, 1.0])
t = np.clip(r0, 0, 1)[:, None]
C = warm * (1 - t) + blue * t
rng = np.random.default_rng(3)
C *= rng.uniform(0.6, 1.2, (len(C), 1))
R = rng.uniform(0.0007, 0.0015, len(P))

s = studio.reset(samples=samples)
studio.world(bg=(0, 0, 0), light=0.0)
o = studio.points(P, R, C.astype(np.float32))
m = studio.bpy.data.materials.new("star")
m.use_nodes = True
nt = m.node_tree
nt.nodes.remove(nt.nodes["Principled BSDF"])
em = nt.nodes.new("ShaderNodeEmission")
at = nt.nodes.new("ShaderNodeAttribute")
at.attribute_name = "col"
nt.links.new(at.outputs["Color"], em.inputs["Color"])
em.inputs["Strength"].default_value = 0.9
nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
studio.set_points_material(o, m)
studio.camera((0.5, -1.6, 3.3), (0.05, 0, 0), lens=40)
s.view_settings.look = "AgX - High Contrast"
# soft glow around dense regions
s.use_nodes = True
s.render.filepath = os.path.join(out, "f")
studio.bpy.ops.render.render(animation=True)
