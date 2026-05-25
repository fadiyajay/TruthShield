'use client';
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, OrbitControls, Environment } from '@react-three/drei';
import { useScanStore } from '@/store/useScanStore';
import * as THREE from 'three';

const CoreMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { isScanning, threatLevel } = useScanStore();

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      const speed = isScanning ? 2 : 0.5;
      meshRef.current.rotation.y = time * speed;
      meshRef.current.rotation.x = time * (speed * 0.5);
    }
  });

  const getColor = () => {
    if (threatLevel === 'critical') return '#ef4444'; // red
    if (threatLevel === 'warning') return '#eab308'; // yellow
    return '#3b82f6'; // blue
  };

  return (
    <Sphere ref={meshRef} args={[1, 64, 64]} scale={2}>
      <MeshDistortMaterial
        color={getColor()}
        envMapIntensity={1}
        clearcoat={1}
        clearcoatRoughness={0.1}
        metalness={0.8}
        roughness={0.2}
        distort={isScanning ? 0.6 : 0.3}
        speed={isScanning ? 5 : 2}
        wireframe={isScanning}
      />
    </Sphere>
  );
};

export default function AICore() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <CoreMesh />
        <Environment preset="city" />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
      </Canvas>
    </div>
  );
}
