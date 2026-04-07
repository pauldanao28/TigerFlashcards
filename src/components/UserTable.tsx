// app/admin/components/UserTable.tsx
import React from "react";

const UserTable = ({ users }: { users: any[] }) => {
  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
              User / Identity
            </th>
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
              Engagement
            </th>
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
              Proficiency
            </th>
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
              Knowledge Base
            </th>
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
              EN → JP Accuracy
            </th>
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">
              JP → EN Accuracy
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {users.map((user) => (
            <tr
              key={user.id}
              className={`transition-all group ${user.reviews_today > 0 ? "bg-indigo-50/20 hover:bg-indigo-50/40" : "hover:bg-slate-50/80"}`}
            >
              <td className="p-6">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">
                    {user.email || "Anonymous"}
                  </span>
                  <span className="text-[9px] font-mono text-slate-300 uppercase mt-1">
                    ID: {user.id.slice(0, 8)}
                  </span>
                </div>
              </td>

              <td className="p-6 text-center">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                      <span
                        className={`text-xs font-black ${user.reviews_today > 0 ? "text-indigo-600" : "text-slate-300"}`}
                      >
                        {user.reviews_today || 0}
                      </span>
                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">
                        Today
                      </span>
                    </div>
                    <div className="w-[1px] h-4 bg-slate-200" />
                    <div className="flex flex-col items-start">
                      <span className="text-lg font-black text-slate-900 flex items-center gap-1">
                        {user.streak_count} <span className="text-sm">🔥</span>
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                    Best: {user.profile_max_streak}
                  </span>
                </div>
              </td>

              <td className="p-6 text-center">
                <div className="flex justify-center gap-2">
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-black text-emerald-600">
                      {user.master_count || user.mastered_count || 0}
                    </span>
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">
                      Mastered
                    </span>
                  </div>
                  <div className="w-[1px] h-6 bg-slate-100 self-center" />
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-black text-rose-500">
                      {user.struggling_count || 0}
                    </span>
                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">
                      Struggling
                    </span>
                  </div>
                </div>
              </td>

              {/* --- UPDATED KNOWLEDGE BASE COLUMN --- */}
              <td className="p-6 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-[11px] font-black">
                      {user.total_cards_added || 0}
                      <span className="opacity-40 text-[9px] ml-1">TOTAL</span>
                    </span>

                    {/* Daily Add Badge - Glows amber if they are hitting the limit */}
                    {user.cards_added_today > 0 && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${
                          user.cards_added_today >= 45
                            ? "bg-amber-50 text-amber-600 border-amber-200 animate-pulse"
                            : "bg-emerald-50 text-emerald-600 border-emerald-100"
                        }`}
                      >
                        +{user.cards_added_today}
                      </span>
                    )}
                  </div>

                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    {user.cards_studied} Studied
                  </span>
                </div>
              </td>

              <td className="p-6 text-right">
                <span
                  className={`text-sm font-black ${user.actual_en_jp_pct > 70 ? "text-indigo-600" : "text-slate-400"}`}
                >
                  {user.actual_en_jp_pct}%
                </span>
              </td>

              <td className="p-6 text-right">
                <span
                  className={`text-sm font-black ${user.actual_jp_en_pct > 70 ? "text-rose-500" : "text-slate-400"}`}
                >
                  {user.actual_jp_en_pct}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;
