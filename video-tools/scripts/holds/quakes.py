"""m096 (4 frames): ten years of real earthquakes (USGS catalogue, every M4+ event
2015-2024, public domain) placed at their epicentres on a pale globe seen
over the Pacific. Nothing draws the coastlines: the plate boundaries and the Ring of
Fire appear from the quakes alone. M7+ events in red.

blender -b -P quakes.py -- <csv_dir> <out_dir> [samples]"""
import sys, os, csv, glob, math, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import studio
bpy = studio.bpy

args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[0], args[1]
samples = int(args[2]) if len(args) > 2 else 96
lat, lon, dep, mag = [], [], [], []
for f in sorted(glob.glob(os.path.join(src, "*.csv"))):
    for r in csv.DictReader(open(f)):
        try:
            lat.append(float(r["latitude"])); lon.append(float(r["longitude"]))
            dep.append(float(r["depth"] or 0)); mag.append(float(r["mag"] or 4))
        except ValueError:
            pass
lat, lon, dep, mag = map(np.array, (lat, lon, dep, mag))
print("events", len(lat))
rad = 1.004 + np.minimum(dep, 700) / 700 * 0.0  # on the surface; the shell hides the far side
la, lo = np.radians(lat), np.radians(lon)
P = np.stack([rad * np.cos(la) * np.cos(lo), rad * np.cos(la) * np.sin(lo), rad * np.sin(la)], 1)
R = 0.0011 * 1.45 ** (mag - 4)
ink = np.array([0.012, 0.011, 0.010])
red = np.array([0.60, 0.06, 0.03])
C = np.where((mag >= 7.0)[:, None], red, ink) * np.ones((len(P), 1))

s = studio.reset(samples=samples)
BG = (0.80, 0.795, 0.78)
studio.world(bg=BG, light=0.45)
o = studio.points(P, R, C.astype(np.float32))
studio.set_points_material(o, studio.attr_material(rough=0.6))
# a matte globe a shade lighter than the backdrop
bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=0.998)
g = bpy.context.object
bpy.ops.object.shade_smooth()
gm = bpy.data.materials.new("shell")
gm.use_nodes = True
b = gm.node_tree.nodes["Principled BSDF"]
b.inputs["Base Color"].default_value = (0.9, 0.895, 0.88, 1)
b.inputs["Roughness"].default_value = 0.8
g.data.materials.append(gm)
# look at the western Pacific: centre lon 150, lat 12
cl, ca = math.radians(150), math.radians(12)
d = 6.2
studio.camera((d * math.cos(ca) * math.cos(cl), d * math.cos(ca) * math.sin(cl), d * math.sin(ca)), (0, 0, -0.02), lens=55)
studio.area("key", (-3, -3, 4), size=6, energy=700)
s.render.filepath = os.path.join(out, "f")
bpy.ops.render.render(animation=True)
