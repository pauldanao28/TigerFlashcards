"use client";
import { motion } from "framer-motion";

export default function Logo({ className = "w-10 h-14" }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05, rotate: 2 }}
      whileTap={{ scale: 0.95 }}
      className={`${className} bg-white border-[3px] border-slate-800 rounded-lg shadow-[3px_3px_0px_0px_rgba(30,41,59,1)] flex items-center justify-center relative select-none cursor-pointer`}
    >
      <div className="w-5 h-5 bg-rose-500 rounded-full shadow-inner"></div>
    </motion.div>
  );
}
