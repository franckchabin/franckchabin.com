import bpy, bmesh

# ============================================================
#  ARRONDIR LES MAINS  -  look "gonflé / cartoon"
#  - Ne change PAS le nombre de polygones (déplace seulement les sommets)
#  - Pas de modificateur, pas de découpe : le mesh reste en une seule pièce
#  - Gonflage proportionnel à la taille -> marche quelle que soit l'échelle
#
#  UTILISATION :
#   1. Sélectionne l'objet "Plane.004" et passe en mode Édition (Tab).
#   2. Désélectionne tout (Alt+A).
#   3. Survole la 1re main et appuie sur L, survole la 2e main et appuie sur L.
#      (L = sélectionne l'îlot sous le curseur -> tu as les deux mains.)
#   4. Espace de travail "Scripting" -> colle ce fichier -> bouton "Run".
#   5. Ajuste les réglages ci-dessous et relance si besoin (Ctrl+Z annule).
# ============================================================

# --- RÉGLAGES (monte les valeurs pour un effet plus marqué) ---
INFLATE_FACTOR = 0.5    # gonflage = ce facteur x longueur moyenne d'arête
SMOOTH_ITER    = 10     # nombre de passes de lissage (arrondit les angles)
SMOOTH_FACTOR  = 0.5    # intensité de chaque passe (0-1)
# --------------------------------------------------------------

obj = bpy.context.active_object
assert obj and obj.type == 'MESH', "Sélectionne d'abord l'objet mesh (Plane.004)."

if obj.mode != 'EDIT':
    bpy.ops.object.mode_set(mode='EDIT')

bm = bmesh.from_edit_mesh(obj.data)
bm.normal_update()

sel = [v for v in bm.verts if v.select]
if not sel:
    raise Exception("Rien de sélectionné : sélectionne les sommets des mains (touche L).")

# longueur moyenne des arêtes touchant la sélection -> échelle du gonflage
sel_set = set(sel)
lengths = [e.calc_length() for e in bm.edges
           if e.verts[0] in sel_set or e.verts[1] in sel_set]
avg_edge = sum(lengths) / len(lengths) if lengths else 0.0
inflate = INFLATE_FACTOR * avg_edge

# 1) Lissage : adoucit les arêtes vives (préserve la topologie)
for _ in range(SMOOTH_ITER):
    bmesh.ops.smooth_vert(
        bm, verts=sel, factor=SMOOTH_FACTOR,
        use_axis_x=True, use_axis_y=True, use_axis_z=True,
    )
    bm.normal_update()

# 2) Gonflage : pousse chaque sommet le long de sa normale -> volume bombé
for v in sel:
    v.co += v.normal * inflate

bmesh.update_edit_mesh(obj.data)
print(f"Mains arrondies : {len(sel)} sommets traités, "
      f"gonflage = {inflate:.4f} (arête moy. {avg_edge:.4f}). "
      f"Polygones inchangés.")
