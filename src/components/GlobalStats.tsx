// app/admin/components/GlobalStats.tsx
import React from "react";

const GlobalStats = ({ users }: { users: any[] }) => {
  const totalUsers = users.length;
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <StatCard
        title="Total Learners"
        value={totalUsers}
        sub="Active Profiles"
        color="text-slate-900"
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
  <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
      {title}
    </p>
    <h3 className={`text-3xl font-black ${color}`}>{value}</h3>
    <p className="text-xs text-slate-400 mt-1 font-medium">{sub}</p>
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
