"""Space-filling renders of real molecular structures from the RCSB Protein Data Bank.

blender -b -P mol.py -- <file.cif> <out_dir> <preset> [samples]
presets:
  m060  nucleosome 1KX5 on pale grey: histone core in white clay, DNA in cobalt (the
        original reel's DNA helix beat)
  m103  a protein cage (biological assembly) on pale grey, pearl spheres (the original's
        bubble torus)
  m181  hemoglobin 4HHB on pale grey: chains in white and warm grey, the four hemes red"""
import sys, os, math, shlex, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import studio

args = sys.argv[sys.argv.index("--") + 1:]
cif, out, preset = args[0], args[1], args[2]
samples = int(args[3]) if len(args) > 3 else 128


def atoms(path):
    """Minimal mmCIF atom_site reader: xyz, element, residue, chain (label_asym_id)."""
    cols, rows, inloop = [], [], False
    for line in open(path):
        if line.startswith("_atom_site."):
            cols.append(line.split(".", 1)[1].strip())
            inloop = True
            continue
        if inloop and (line.startswith("ATOM") or line.startswith("HETATM")):
            rows.append(line.split())
        elif inloop and cols and rows and (line.startswith("#") or line.startswith("loop_")):
            break
    ix = {c: i for i, c in enumerate(cols)}
    xyz = np.array([[float(r[ix["Cartn_x"]]), float(r[ix["Cartn_y"]]), float(r[ix["Cartn_z"]])] for r in rows])
    el = np.array([r[ix["type_symbol"]] for r in rows])
    res = np.array([r[ix["label_comp_id"]] for r in rows])
    ch = np.array([r[ix["label_asym_id"]] + "/" + r[ix.get("pdbx_PDB_model_num", 0)] for r in rows])
    keep = el != "H"
    keep &= res != "HOH"
    return xyz[keep], el[keep], res[keep], ch[keep]


xyz, el, res, ch = atoms(cif)
VDW = {"C": 1.7, "N": 1.55, "O": 1.52, "S": 1.8, "P": 1.8, "FE": 1.6}
rad = np.array([VDW.get(e.upper(), 1.7) for e in el])
c = xyz.mean(0)
# orient by principal axes: the flattest axis (e.g. the nucleosome's superhelix axis) to z
w, V = np.linalg.eigh(np.cov((xyz - c).T))
xyz = (xyz - c) @ V[:, ::-1]
c = np.zeros(3)
span = np.ptp(xyz, 0).max()
S = 2.0 / span                       # fit the molecule in ~2 units
P = (xyz - c) * S
R = rad * S
print("atoms", len(P), "span", span)

s = studio.reset(samples=samples)
studio.world(bg=(0.84, 0.845, 0.86), light=0.5)
DNA = np.isin(res, ["DA", "DC", "DG", "DT", "A", "C", "G", "U"])
HEM = res == "HEM"
uch = {k: i for i, k in enumerate(dict.fromkeys(ch))}
ci = np.array([uch[k] for k in ch])

if preset == "m060":
    col = np.where(DNA[:, None], [0.012, 0.035, 0.30], [0.80, 0.79, 0.76])
    col[DNA & (ci % 2 == 1)] = [0.02, 0.06, 0.42]     # the two strands a shade apart
    rough, sss, coat = 0.4, 0.2, 0.5
    cam, tgt, lens = (1.1, -2.0, 3.9), (0, 0, 0), 66   # down the superhelix axis, tilted
elif preset == "m103":
    pal = np.array([[0.80, 0.84, 0.92], [0.92, 0.92, 0.93], [0.66, 0.74, 0.88]])
    col = pal[ci % 3]
    rough, sss, coat = 0.18, 0.3, 0.8
    cam, tgt, lens = (2.3, -2.7, 1.6), (0, 0, 0), 38
else:  # m181
    pal = np.array([[0.90, 0.89, 0.86], [0.42, 0.40, 0.37], [0.90, 0.89, 0.86], [0.42, 0.40, 0.37]])
    col = pal[ci % 4]
    col[HEM] = [0.75, 0.05, 0.04]
    rough, sss, coat = 0.4, 0.2, 0.3
    cam, tgt, lens = (2.5, -2.6, 1.0), (0, 0, 0), 40

o = studio.points(P, R, col.astype(np.float32))
m = studio.attr_material(rough=rough, sss=sss)
b = m.node_tree.nodes["Principled BSDF"]
b.inputs["Coat Weight"].default_value = coat
studio.set_points_material(o, m)
studio.camera(cam, tgt, lens=lens)
studio.area("key", (-3, -2.5, 3.5), size=5, energy=900)
studio.area("rim", (2.5, 3.0, 2.0), size=4, energy=450, color=(0.9, 0.93, 1.0))
studio.area("fill", (3.5, -1.0, -0.5), size=4, energy=120)
s.render.filepath = os.path.join(out, "f")
studio.bpy.ops.render.render(animation=True)
