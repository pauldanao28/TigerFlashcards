// app/admin/components/UserTable.tsx
import React from "react";

const UserTable = ({ users }: { users: any[] }) => {
  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
              User / Identity
            </th>
            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
              Engagement
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
              className="hover:bg-slate-50/80 transition-all group"
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
                  <span className="text-lg font-black text-slate-900 flex items-center gap-1">
                    {user.streak_count} <span className="text-sm">🔥</span>
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                    Best: {user.profile_max_streak}
                  </span>
                </div>
              </td>

              <td className="p-6 text-center">
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-black">
                  {user.cards_studied} <span className="opacity-40">WORDS</span>
                </span>
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
