"""m177: two disc galaxies passing each other, a restricted three-body simulation in
the manner of Toomre & Toomre (1972): two softened point masses on a parabolic orbit,
each carrying a disc of massless stars. The tidal bridge and tails come from the
physics. Writes points for galaxies.py (Blender).

python sim_galaxies.py <out.npz>"""
import sys, numpy as np

rng = np.random.default_rng(1972)
G, M, EPS = 1.0, 1.0, 0.15


def disc(n, rmax, incl, node):
    r = np.concatenate([np.sqrt(rng.uniform(0.0, 1, n - n // 5)), np.abs(rng.normal(0, 0.12, n // 5))]) * rmax + 0.02
    th = rng.uniform(0, 2 * np.pi, n)
    p = np.stack([r * np.cos(th), r * np.sin(th), rng.normal(0, 0.02, n)], 1)
    v = np.sqrt(G * M * r**2 / (r**2 + EPS**2) ** 1.5)
    u = np.stack([-np.sin(th) * v, np.cos(th) * v, np.zeros(n)], 1)
    ci, si, cn, sn = np.cos(incl), np.sin(incl), np.cos(node), np.sin(node)
    Rx = np.array([[1, 0, 0], [0, ci, -si], [0, si, ci]])
    Rz = np.array([[cn, -sn, 0], [sn, cn, 0], [0, 0, 1]])
    T = Rz @ Rx
    return p @ T.T, u @ T.T, r / rmax


# parabolic encounter, pericentre q
q = 1.2
B = float(sys.argv[3]) if len(sys.argv) > 3 else 2.6
cores_p = np.array([[-6.0, -B / 2, 0.0], [6.0, B / 2, 0.0]])
d = np.linalg.norm(cores_p[1] - cores_p[0])
vrel = np.sqrt(2 * G * 2 * M / d)
dirv = np.array([1.0, 0.0, 0.0]); dirv /= np.linalg.norm(dirv)
cores_v = np.array([vrel / 2 * dirv, -vrel / 2 * dirv]) 
pa, va, ra = disc(110000, 1.5, np.radians(15), 0.3)
pb, vb, rb = disc(70000, 1.2, np.radians(60), 1.9)
P = np.concatenate([pa + cores_p[0], pb + cores_p[1]])
V = np.concatenate([va + cores_v[0], vb + cores_v[1]])
R0 = np.concatenate([ra, rb])
gal = np.concatenate([np.zeros(len(pa)), np.ones(len(pb))])


def acc(x, cores):
    a = np.zeros_like(x)
    for c in cores:
        dx = c - x
        a += G * M * dx / (np.sum(dx**2, -1, keepdims=True) + EPS**2) ** 1.5
    return a


dt, steps = 0.01, int(sys.argv[2]) if len(sys.argv) > 2 else 1400
snaps = {}
for i in range(steps):
    ca = acc(cores_p, [cores_p[1], cores_p[0]][::1])
    # each core feels only the other
    ca = np.stack([acc(cores_p[:1], [cores_p[1]])[0], acc(cores_p[1:], [cores_p[0]])[0]])
    V += 0.5 * dt * acc(P, cores_p)
    cores_v += 0.5 * dt * ca
    P += dt * V
    cores_p += dt * cores_v
    ca = np.stack([acc(cores_p[:1], [cores_p[1]])[0], acc(cores_p[1:], [cores_p[0]])[0]])
    V += 0.5 * dt * acc(P, cores_p)
    cores_v += 0.5 * dt * ca
    if (i + 1) % 200 == 0:
        snaps[i + 1] = P.copy()
np.savez_compressed(sys.argv[1], **{f'P{k}': v for k, v in snaps.items()}, P=P, r0=R0, gal=gal, cores=cores_p)
print("cores", cores_p.round(2), "spread", np.ptp(P, 0).round(1))
