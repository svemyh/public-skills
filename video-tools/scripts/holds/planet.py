"""Moon and Earth rendered from NASA maps (public domain).

blender -b -P planet.py -- <out_dir> <preset> <color_map> <height_map> [samples]
presets:
  moon  one Moon on the pale backdrop lit at a phase angle (argument 6, degrees; LRO
        colour + LOLA elevation); m052 composites seven of these into a row
  m058  one Moon, a sharp half-lit terminator, on black
  m186  the Earth as a relief globe on a pale studio sweep: Blue Marble colour, ETOPO
        elevation exaggerated so the continents stand up (the original's Earth sculpture)"""
import sys, os, math, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import studio
bpy = studio.bpy

args = sys.argv[sys.argv.index("--") + 1:]
out, preset, cmap, hmap = args[:4]
samples = int(args[4]) if len(args) > 4 else 128


def globe(name, loc, radius, disp, midlevel=0.5):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=512, ring_count=256, radius=radius, location=loc)
    o = bpy.context.object
    o.name = name
    bpy.ops.object.shade_smooth()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    ci = nt.nodes.new("ShaderNodeTexImage")
    ci.image = bpy.data.images.load(cmap)
    hi = nt.nodes.new("ShaderNodeTexImage")
    hi.image = bpy.data.images.load(hmap)
    hi.image.colorspace_settings.name = "Non-Color"
    for n in (ci, hi):
        nt.links.new(tc.outputs["UV"], n.inputs["Vector"])
    nt.links.new(ci.outputs["Color"], b.inputs["Base Color"])
    dn = nt.nodes.new("ShaderNodeDisplacement")
    dn.inputs["Midlevel"].default_value = midlevel
    dn.inputs["Scale"].default_value = disp
    nt.links.new(hi.outputs["Color"], dn.inputs["Height"])
    nt.links.new(dn.outputs[0], nt.nodes["Material Output"].inputs["Displacement"])
    m.displacement_method = "BOTH"
    b.inputs["Roughness"].default_value = 0.9
    o.data.materials.append(m)
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = sub.render_levels = 1
    return o, m


s = studio.reset(samples=samples)
if preset == "moon":
    phase = float(args[5]) if len(args) > 5 else 90
    studio.world(bg=(0.88, 0.875, 0.86), light=0.004)
    o, m = globe("moon", (0, 0, 0), 1.0, 0.02)
    o.rotation_euler = (math.radians(6), 0, math.radians(-90))
    s.render.resolution_x = s.render.resolution_y = 1000
    studio.camera((0, -6.2, 0), (0, 0, 0), lens=110)
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy, sun.angle = 5, math.radians(0.5)
    so = bpy.data.objects.new("sun", sun)
    bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(90), 0, math.radians(phase))
elif preset == "m058":
    studio.world(bg=(0, 0, 0), light=0.0)
    o, m = globe("moon", (0, 0, 0), 1.0, 0.02)
    o.rotation_euler = (math.radians(6), 0, math.radians(-90))
    studio.camera((0, -6.2, 0), (0, 0, 0), lens=70)
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy, sun.angle = 6, math.radians(0.5)
    so = bpy.data.objects.new("sun", sun)
    bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(90), 0, math.radians(-97))
else:  # m186
    studio.world(bg=(0.85, 0.85, 0.855), light=0.35)
    o, m = globe("earth", (0, 0, 0), 1.0, 0.06, midlevel=0.42)
    o.rotation_euler = (math.radians(-18), math.radians(8), math.radians(195))
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Coat Weight"].default_value = 0.3
    studio.floor((0.85, 0.85, 0.855), z=-1.06)
    studio.camera((2.6, -5.6, 1.0), (0, 0, -0.08), lens=55)
    studio.area("key", (-4, -3, 5), size=6, energy=1600)
    studio.area("rim", (3, 4, 2.5), size=4, energy=500, color=(0.9, 0.93, 1.0))
s.render.filepath = os.path.join(out, "f")
bpy.ops.render.render(animation=True)
