import { useEffect } from "react";
import { JarvisIsland } from "../components/jarvis-island";

/** The JARVIS island window of the Windows companion (#/island): only the island, on a black background. */
export default function IslandPage() {
  useEffect(() => {
    document.documentElement.classList.add("island-mode");
    return () => document.documentElement.classList.remove("island-mode");
  }, []);
  return <JarvisIsland />;
}
