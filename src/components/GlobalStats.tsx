// app/admin/components/GlobalStats.tsx
import React from "react";

const GlobalStats = ({ users }: { users: any[] }) => {
  const totalUsers = users.length;
  const totalMastered = users.reduce(
    (acc, u) => acc + (u.mastered_count || 0),
    0,
  );
  const totalStruggling = users.reduce(
    (acc, u) => acc + (u.struggling_count || 0),
    0,
  );

  const avgEnJp = users.length
    ? (
        users.reduce((acc, u) => acc + u.actual_en_jp_pct, 0) / totalUsers
      ).toFixed(1)
    : 0;
  const avgJpEn = users.length
    ? (
        users.reduce((acc, u) => acc + u.actual_jp_en_pct, 0) / totalUsers
      ).toFixed(1)
    : 0;
  const totalCards = users.reduce((acc, u) => acc + u.cards_studied, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-10">
      <StatCard
        title="Total Learners"
        value={totalUsers}
        sub="Active Profiles"
        color="text-slate-900"
      />
      {/* NEW: Mastered Global Stat */}
      <StatCard
        title="Mastered"
        value={totalMastered}
        sub="High Accuracy"
        color="text-emerald-600"
      />
      {/* NEW: Struggling Global Stat */}
      <StatCard
        title="Struggling"
        value={totalStruggling}
        sub="Needs Review"
        color="text-amber-500"
      />
      <StatCard
        title="Avg EN → JP"
        value={`${avgEnJp}%`}
        sub={`${totalCards} Total Cards`}
        color="text-indigo-600"
        barColor="bg-indigo-500"
        percent={Number(avgEnJp)}
      />
      <StatCard
        title="Avg JP → EN"
        value={`${avgJpEn}%`}
        sub="Recognition Accuracy"
        color="text-rose-500"
        barColor="bg-rose-500"
        percent={Number(avgJpEn)}
      />
    </div>
  );
};

const StatCard = ({ title, value, sub, color, barColor, percent }: any) => (
  <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
      {title}
    </p>
    <h3 className={`text-2xl font-black ${color}`}>{value}</h3>
    <p className="text-[10px] text-slate-400 mt-1 font-medium">{sub}</p>
    {percent !== undefined && (
      <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-50">
        <div
          className={`h-full ${barColor} transition-all duration-1000`}
          style={{ width: `${percent}%` }}
        />
      </div>
    )}
  </div>
);

export default GlobalStats;
