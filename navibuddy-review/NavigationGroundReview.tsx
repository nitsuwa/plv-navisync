import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { IskolarWalker3D } from "../src/components/map/IskolarWalker3D";
import { NaviBuddyAppearanceContext } from "../src/contexts/NaviBuddyStore";
import { DEFAULT_NAVIBUDDY_APPEARANCE, NAVIBUDDY_OUTFITS, NAVIBUDDY_OUTFIT_DETAILS, type NaviBuddyOutfit } from "../src/lib/naviBuddy";
import "../src/styles/index.css";

function ReviewCamera() {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(0.18, 0.36, 1.3);
    camera.lookAt(0, 0.28, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function NavigationGroundReview() {
  const [outfit, setOutfit] = useState<NaviBuddyOutfit>("classic");
  const [surface, setSurface] = useState<"campus" | "floor">("campus");
  const groundY = surface === "campus" ? 0.12 : 0.012;
  const appearance = { ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit };
  return <main className="mx-auto min-h-screen max-w-4xl bg-background p-4 text-foreground sm:p-8">
    <p className="mb-3 rounded-full bg-amber-100 px-3 py-1 text-center text-xs font-extrabold text-amber-900">ISOLATED NAVIGATION RENDER · PRODUCTION WALKER · SYNTHETIC APPEARANCE · NO AUTH</p>
    <h1 className="text-xl font-extrabold">NaviBuddy · Ground contact review</h1>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setSurface("campus")}>Outdoor route surface</button>
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setSurface("floor")}>Indoor floor surface</button>
      {NAVIBUDDY_OUTFITS.map((variant) => <button key={variant} className="rounded-lg border px-3 py-2 text-sm" onClick={() => setOutfit(variant)}>{NAVIBUDDY_OUTFIT_DETAILS[variant].label}</button>)}
    </div>
    <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-[#dce8dc]" style={{ height: "min(560px, 62vh)", minHeight: 360 }}>
      <Canvas camera={{ position: [0.38, 0.48, 1.05], fov: 34 }} dpr={[1, 1.5]}>
        <ReviewCamera />
        <color attach="background" args={["#dce8dc"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[2, 4, 3]} intensity={2.0} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]}>
          <planeGeometry args={[2.5, 2.5]} />
          <meshStandardMaterial color="#b8c6ad" roughness={1} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.001, 0]}>
          <planeGeometry args={[0.26, 2.5]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]}>
          <planeGeometry args={[0.22, 2.5]} />
          <meshBasicMaterial color="#1769e0" />
        </mesh>
        <NaviBuddyAppearanceContext.Provider value={appearance}>
          <group position={[0, groundY, 0]}>
            <IskolarWalker3D appearance={appearance} reducedMotion navigationPresentation />
          </group>
        </NaviBuddyAppearanceContext.Provider>
      </Canvas>
    </div>
    <p className="mt-3 text-sm text-muted-foreground">Surface: {surface === "campus" ? "route ribbon at y=0.12" : "floor plane at y=0.012"}. Walker origin is placed at the route/floor surface; the raised customization platform is disabled.</p>
  </main>;
}

const node = document.getElementById("root")!;
const hot = import.meta.hot;
const root = hot?.data.navigationGroundRoot ?? createRoot(node);
if (hot) hot.data.navigationGroundRoot = root;
root.render(<NavigationGroundReview />);
