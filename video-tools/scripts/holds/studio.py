"""Shared Blender 4.x/5.x scene setup for real-data hold frames: Cycles GPU/CPU
auto-detection, AgX color management, a flat studio ground seen by the camera,
soft sky + area lighting, hair-curve fibres, and Geometry Nodes sphere clouds.

Run headless inside Blender:
    blender -b -P <shot>.py -- <args>
"""
import bpy, numpy as np
from mathutils import Vector


def _enable_best_gpu(scene):
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
                usable = [d for d in prefs.devices if d.type != "CPU"]
                if usable:
                    for d in prefs.devices:
                        d.use = True
                    scene.cycles.device = "GPU"
                    return backend
            except Exception:
                continue
    except Exception:
        pass
    scene.cycles.device = "CPU"
    return "CPU"


def reset(width=1920, height=1080, samples=96, frames=1, fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    _enable_best_gpu(s)
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.render.use_persistent_data = True
    s.render.resolution_x, s.render.resolution_y = width, height
    s.render.fps = fps
    s.frame_start, s.frame_end = 1, frames
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Base Contrast"
    s.render.image_settings.file_format = "PNG"
    return s


def world(bg=(0.86, 0.86, 0.87), light=1.0):
    """Camera sees a flat backdrop color; objects are lit by a soft neutral sky."""
    w = bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    lp = nt.nodes.new("ShaderNodeLightPath")
    cam = nt.nodes.new("ShaderNodeBackground")
    cam.inputs[0].default_value = (*bg, 1)
    cam.inputs[1].default_value = 1.0
    sky = nt.nodes.new("ShaderNodeBackground")
    sky.inputs[0].default_value = (0.9, 0.9, 0.92, 1)
    sky.inputs[1].default_value = light
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(sky.outputs[0], mix.inputs[1])
    nt.links.new(cam.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


def look(o, target):
    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def area(name, loc, target=(0, 0, 0), size=4.0, energy=800, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, "AREA")
    l.size, l.energy, l.color = size, energy, color
    o = bpy.data.objects.new(name, l)
    bpy.context.collection.objects.link(o)
    o.location = loc
    look(o, target)
    return o


def camera(loc, target, lens=50):
    c = bpy.data.cameras.new("cam")
    c.lens = lens
    o = bpy.data.objects.new("cam", c)
    bpy.context.collection.objects.link(o)
    o.location = loc
    look(o, target)
    bpy.context.scene.camera = o
    return o


def fibres(P, off, colors, radius=0.0015, name="fibres"):
    """Hair curves: P (n,3) points, off (k+1) curve offsets, colors (n,3)."""
    c = bpy.data.hair_curves.new(name)
    sizes = np.diff(off).astype(int).tolist()
    c.add_curves(sizes)
    c.position_data.foreach_set("vector", P.astype(np.float32).ravel())
    col = c.attributes.new("col", "FLOAT_COLOR", "POINT")
    rgba = np.concatenate([colors, np.ones((len(colors), 1))], 1).astype(np.float32)
    col.data.foreach_set("color", rgba.ravel())
    r = c.attributes.get("radius") or c.attributes.new("radius", "FLOAT", "POINT")
    r.data.foreach_set("value", np.full(len(P), radius, np.float32))
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    return o


def attr_material(name="fibre", rough=0.35, emission=0.0, sss=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = "col"
    nt.links.new(at.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        nt.links.new(at.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission
    if sss:
        bsdf.inputs["Subsurface Weight"].default_value = sss
    return m


def points(P, radii, colors, name="points"):
    """Spheres at P (n,3), Cycles point cloud via Mesh to Points; 'col' and 'r' attributes."""
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(P))
    me.vertices.foreach_set("co", P.astype(np.float32).ravel())
    r = me.attributes.new("r", "FLOAT", "POINT")
    r.data.foreach_set("value", np.broadcast_to(np.asarray(radii, np.float32), (len(P),)).copy())
    col = me.attributes.new("col", "FLOAT_COLOR", "POINT")
    rgba = np.concatenate([colors, np.ones((len(colors), 1))], 1).astype(np.float32)
    col.data.foreach_set("color", rgba.ravel())
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    ng = bpy.data.node_groups.new(name + "_gn", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi = ng.nodes.new("NodeGroupInput")
    go = ng.nodes.new("NodeGroupOutput")
    m2p = ng.nodes.new("GeometryNodeMeshToPoints")
    na = ng.nodes.new("GeometryNodeInputNamedAttribute")
    na.data_type = "FLOAT"
    na.inputs["Name"].default_value = "r"
    ng.links.new(gi.outputs[0], m2p.inputs["Mesh"])
    ng.links.new(na.outputs["Attribute"], m2p.inputs["Radius"])
    sm = ng.nodes.new("GeometryNodeSetMaterial")
    ng.links.new(m2p.outputs[0], sm.inputs["Geometry"])
    ng.links.new(sm.outputs[0], go.inputs[0])
    mod = o.modifiers.new("pts", "NODES")
    mod.node_group = ng
    o["_setmat"] = sm.name
    return o


def set_points_material(o, mat):
    ng = o.modifiers["pts"].node_group
    ng.nodes[o["_setmat"]].inputs["Material"].default_value = mat


def floor(color=(0.85, 0.85, 0.86), z=0.0, size=40):
    """A large matte plane that catches soft studio bounce and contact shadows."""
    import bmesh

    me = bpy.data.meshes.new("floor")
    o = bpy.data.objects.new("floor", me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    bm.to_mesh(me)
    o.location.z = z
    m = bpy.data.materials.new("floor")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = 0.9
    me.materials.append(m)
    return o
