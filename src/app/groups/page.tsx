"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, query, where, updateDoc, arrayUnion, writeBatch } from "firebase/firestore";
import { Group, Invite } from "@/types";
import { getMaxMembersPerGroup, DEFAULT_MAX_MEMBERS_PER_GROUP } from "@/lib/config";

export default function GroupsPage() {
  const [user, setUser] = useState<any>(null);
  const [dbUser, setDbUser] = useState<any>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [maxMembers, setMaxMembers] = useState(DEFAULT_MAX_MEMBERS_PER_GROUP);
  const [loading, setLoading] = useState(true);
  
  // Forms State
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [error, setError] = useState("");

  // New Group Config States
  const [entryFee, setEntryFee] = useState(0);
  const [exactScorePoints, setExactScorePoints] = useState(3);
  const [correctOutcomePoints, setCorrectOutcomePoints] = useState(1);
  const [uniquePredictionPoints, setUniquePredictionPoints] = useState(0);
  const [quarterFinalsBonus, setQuarterFinalsBonus] = useState(0);
  const [semiFinalsBonus, setSemiFinalsBonus] = useState(0);
  const [finalsBonus, setFinalsBonus] = useState(0);
  const [firstPlacePercent, setFirstPlacePercent] = useState(50);
  const [secondPlacePercent, setSecondPlacePercent] = useState(30);
  const [thirdPlacePercent, setThirdPlacePercent] = useState(20);

  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }
      setUser(currentUser);
      
      try {
        // Fetch user profile from Firestore
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setDbUser(userDoc.data());
        }

        // Fetch groups where user is a member
        const q = query(collection(db, "groups"), where("members", "array-contains", currentUser.uid));
        const snapshot = await getDocs(q);
        const groupsData: Group[] = [];
        snapshot.forEach((doc) => {
          groupsData.push({ id: doc.id, ...doc.data() } as Group);
        });
        setGroups(groupsData);

        // Global member cap (admin-configurable), for capacity display + invite maxUses.
        setMaxMembers(await getMaxMembersPerGroup());
      } catch (err) {
        console.error("Error fetching groups:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;
    setCreateLoading(true);
    setError("");

    try {
      if (firstPlacePercent + secondPlacePercent + thirdPlacePercent !== 100) {
        setError("La distribución de premios debe sumar exactamente 100%.");
        setCreateLoading(false);
        return;
      }

      const groupId = `group_${Date.now()}`;
      // Snapshot the global member cap as the invite's maxUses (rules require
      // maxUses to equal the live cap, so read it right before writing).
      const cap = await getMaxMembersPerGroup();

      // Generate a unique-ish 6-character uppercase alphanumeric code
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      // Ensure the invite code is unique (it is the doc id in /invites).
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await getDoc(doc(db, "invites", code));
        if (!existing.exists()) break;
        code = "";
        for (let i = 0; i < 6; i++) {
          code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
      }

      const newGroup: Group = {
        id: groupId,
        name: newGroupName.trim(),
        creatorId: user.uid,
        inviteCode: code,
        members: [user.uid],
        createdAt: new Date(),
        entryFee: Number(entryFee),
        rules: {
          exactScorePoints: Number(exactScorePoints),
          correctOutcomePoints: Number(correctOutcomePoints),
          uniquePredictionPoints: Number(uniquePredictionPoints),
          quarterFinalsBonus: Number(quarterFinalsBonus),
          semiFinalsBonus: Number(semiFinalsBonus),
          finalsBonus: Number(finalsBonus),
        },
        prizeDistribution: {
          firstPlacePercent: Number(firstPlacePercent),
          secondPlacePercent: Number(secondPlacePercent),
          thirdPlacePercent: Number(thirdPlacePercent),
        }
      };

      const groupInvite: Invite = {
        code,
        type: "group",
        groupId,
        groupName: newGroup.name,
        maxUses: cap,
        uses: 0,
        consumedBy: [],
        expiresAt: null,
        active: true,
        createdBy: user.uid,
        createdAt: new Date(),
      };

      const batch = writeBatch(db);
      batch.set(doc(db, "groups", groupId), newGroup);
      batch.set(doc(db, "invites", code), groupInvite);
      await batch.commit();
      setGroups([...groups, newGroup]);
      setNewGroupName("");
      setEntryFee(0);
      setExactScorePoints(3);
      setCorrectOutcomePoints(1);
      setUniquePredictionPoints(0);
      setQuarterFinalsBonus(0);
      setSemiFinalsBonus(0);
      setFinalsBonus(0);
      setFirstPlacePercent(50);
      setSecondPlacePercent(30);
      setThirdPlacePercent(20);
      router.push(`/groups/${groupId}?created=true`);
    } catch (err: any) {
      console.error(err);
      setError("Error al crear el grupo. Por favor, inténtalo de nuevo.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode || !user) return;
    setJoinLoading(true);
    setError("");

    try {
      const codeSnap = await getDoc(doc(db, "invites", cleanCode));
      const groupId = codeSnap.exists() ? (codeSnap.data().groupId as string | null) : null;
      if (!groupId) {
        setError("Código de invitación inválido. Grupo no encontrado.");
        setJoinLoading(false);
        return;
      }

      // Adding only ourselves is permitted by the rules even before we can read
      // the group (idempotent if we are already a member). A rejection here
      // means the group has hit the global member cap.
      try {
        await updateDoc(doc(db, "groups", groupId), {
          members: arrayUnion(user.uid)
        });
      } catch {
        setError("Este grupo ya está lleno.");
        setJoinLoading(false);
        return;
      }

      router.push(`/groups/${groupId}`);
    } catch (err: any) {
      console.error(err);
      setError("Error al unirse al grupo. Por favor, inténtalo de nuevo.");
    } finally {
      setJoinLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        
        {/* Header navigation */}
        <div className="flex justify-between items-center border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight">Mis Grupos</h1>
            <span className="text-gray-500">|</span>
            <button 
              onClick={() => router.push("/dashboard")} 
              className="text-gray-400 hover:text-emerald-400 transition-colors font-medium"
            >
              Tablero
            </button>
          </div>
          <div className="text-sm text-gray-400">
            Sesión iniciada como: <span className="text-emerald-400 font-semibold">{dbUser?.displayName || user?.email}</span>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main groups listing */}
          <div className="md:col-span-2 space-y-6">
            <h2 className="text-xl font-bold text-gray-300">Grupos Activos ({groups.length})</h2>
            
            {groups.length === 0 ? (
              <div className="p-8 bg-white/5 border border-white/10 rounded-2xl text-center text-gray-500">
                Aún no te has unido ni has creado ningún grupo. ¡Usa el panel de la derecha para comenzar!
              </div>
            ) : (
              <div className="grid gap-4">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4 transition-all duration-200 group"
                  >
                    <div
                      onClick={() => router.push(`/groups/${group.id}`)}
                      className="flex justify-between items-center cursor-pointer"
                    >
                      <div>
                        <h3 className="text-xl font-bold group-hover:text-emerald-400 transition-colors">{group.name}</h3>
                        <div className="text-sm text-gray-400 mt-2">
                          {group.members.length} / {maxMembers} miembros • Código: <span className="font-mono text-purple-400 font-bold">{group.inviteCode}</span>
                        </div>
                      </div>
                      <div className="h-10 w-10 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-emerald-600 transition-colors text-white font-bold">
                        →
                      </div>
                    </div>
                    <a
                      onClick={(e) => e.stopPropagation()}
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                        `¡Únete a mi grupo de apuestas en La Polla Mundial 2026! ⚽🏆\n\nGrupo: *${group.name}*\nCódigo de Invitación: *${group.inviteCode}*\nInscripción: *${group.entryFee ? `$${group.entryFee.toLocaleString()}` : "Gratis"}*\n\nRegístrate e ingresa tus pronósticos aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login?invite=${group.inviteCode}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2 bg-[#25D366] hover:bg-[#1ebe5b] text-black font-bold rounded-lg transition-all text-sm"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.911zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                      </svg>
                      Compartir por WhatsApp
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group Management Side Panel */}
          <div className="space-y-6">
            
            {/* Join Group */}
            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
              <h3 className="text-lg font-bold text-purple-400">Unirse a un Grupo</h3>
              <p className="text-xs text-gray-400">Ingresa el código de 6 caracteres compartido por un amigo para unirte a su grupo.</p>
              <form onSubmit={handleJoinGroup} className="space-y-3">
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  maxLength={6}
                  placeholder="CÓDIGO DE INVITACIÓN"
                  className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase tracking-widest text-center font-mono font-bold"
                />
                <button
                  type="submit"
                  disabled={joinLoading}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold transition-colors disabled:opacity-50 text-sm"
                >
                  {joinLoading ? "Uniéndose..." : "Unirse al Grupo"}
                </button>
              </form>
            </div>

            {/* Create Group */}
            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
              <h3 className="text-lg font-bold text-emerald-400">Crear un Grupo</h3>
              <p className="text-xs text-gray-400">Crea un grupo de apuestas privado y configura sus tarifas, reglas y premios.</p>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Nombre del Grupo</label>
                  <input
                    type="text"
                    required
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Nombre del Grupo"
                    className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Inscripción ($)</label>
                    <input 
                      type="number"
                      min="0"
                      value={entryFee}
                      onChange={(e) => setEntryFee(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-bold text-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Marcador Exacto (pts)</label>
                    <input 
                      type="number"
                      min="0"
                      value={exactScorePoints}
                      onChange={(e) => setExactScorePoints(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Acertar Ganador (pts)</label>
                    <input 
                      type="number"
                      min="0"
                      value={correctOutcomePoints}
                      onChange={(e) => setCorrectOutcomePoints(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase font-semibold mb-1">Bono Predicción Única (pts)</label>
                    <input 
                      type="number"
                      min="0"
                      value={uniquePredictionPoints}
                      onChange={(e) => setUniquePredictionPoints(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                    />
                  </div>
                </div>

                <div className="border-t border-white/5 pt-2 space-y-2">
                  <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Bonos de Fases (pts)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Cuartos</label>
                      <input 
                        type="number"
                        min="0"
                        value={quarterFinalsBonus}
                        onChange={(e) => setQuarterFinalsBonus(Number(e.target.value))}
                        className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Semis</label>
                      <input 
                        type="number"
                        min="0"
                        value={semiFinalsBonus}
                        onChange={(e) => setSemiFinalsBonus(Number(e.target.value))}
                        className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-gray-400 uppercase mb-0.5">Final</label>
                      <input 
                        type="number"
                        min="0"
                        value={finalsBonus}
                        onChange={(e) => setFinalsBonus(Number(e.target.value))}
                        className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-2 space-y-2">
                  <span className="block text-[9px] text-gray-500 uppercase font-bold tracking-wider">Distribución del Pozo (%)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[8px] text-gray-400 uppercase mb-0.5">1º Lugar</label>
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        value={firstPlacePercent}
                        onChange={(e) => setFirstPlacePercent(Number(e.target.value))}
                        className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs font-bold text-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-gray-400 uppercase mb-0.5">2º Lugar</label>
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        value={secondPlacePercent}
                        onChange={(e) => setSecondPlacePercent(Number(e.target.value))}
                        className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] text-gray-400 uppercase mb-0.5">3º Lugar</label>
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        value={thirdPlacePercent}
                        onChange={(e) => setThirdPlacePercent(Number(e.target.value))}
                        className="w-full px-2 py-1 bg-black/50 border border-white/10 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold transition-colors disabled:opacity-50 text-sm"
                >
                  {createLoading ? "Creando..." : "Crear Grupo"}
                </button>
              </form>
            </div>

          </div>

        </div>
        
      </div>
    </div>
  );
}
