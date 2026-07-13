"use client";
import { createContext, useContext, useState } from "react";

interface UploadGuardContextType {
  isBusy: boolean;
  setIsBusy: (busy: boolean) => void;
}

const UploadGuardContext = createContext<UploadGuardContextType>({
  isBusy: false,
  setIsBusy: () => {},
});

export const UploadGuardProvider = ({ children }: { children: React.ReactNode }) => {
  const [isBusy, setIsBusy] = useState(false);
  return (
    <UploadGuardContext.Provider value={{ isBusy, setIsBusy }}>
      {children}
    </UploadGuardContext.Provider>
  );
};

export const useUploadGuard = () => useContext(UploadGuardContext);
