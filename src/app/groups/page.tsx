"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, query, where, updateDoc, arrayUnion, writeBatch } from "firebase/firestore";
import { Group } from "@/types";

export default function GroupsPage() {
  const [user, setUser] = useState<any>(null);
  const [dbUser, setDbUser] = useState<any>(null);
  const [groups, setGroups] = useState<Group[]>([]);
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
      
      // Generate a unique-ish 6-character uppercase alphanumeric code
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      // Ensure the invite code is unique (it is the doc id in the public inviteCodes lookup).
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await getDoc(doc(db, "inviteCodes", code));
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

      const batch = writeBatch(db);
      batch.set(doc(db, "groups", groupId), newGroup);
      batch.set(doc(db, "inviteCodes", code), { code, groupId });
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
      const codeSnap = await getDoc(doc(db, "inviteCodes", cleanCode));
      if (!codeSnap.exists()) {
        setError("Código de invitación inválido. Grupo no encontrado.");
        setJoinLoading(false);
        return;
      }

      const { groupId } = codeSnap.data() as { groupId: string };

      // Adding only ourselves is permitted by the rules even before we can read
      // the group (idempotent if we are already a member).
      await updateDoc(doc(db, "groups", groupId), {
        members: arrayUnion(user.uid)
      });

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
                    onClick={() => router.push(`/groups/${group.id}`)}
                    className="p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex justify-between items-center cursor-pointer transition-all hover:scale-[1.01] duration-200 group"
                  >
                    <div>
                      <h3 className="text-xl font-bold group-hover:text-emerald-400 transition-colors">{group.name}</h3>
                      <div className="text-sm text-gray-400 mt-2">
                        {group.members.length} {group.members.length === 1 ? 'miembro' : 'miembros'} • Código de Invitación: <span className="font-mono text-purple-400 font-bold">{group.inviteCode}</span>
                      </div>
                    </div>
                    <div className="h-10 w-10 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-emerald-600 transition-colors text-white font-bold">
                      →
                    </div>
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
