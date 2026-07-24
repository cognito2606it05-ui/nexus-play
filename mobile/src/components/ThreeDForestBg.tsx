import React, { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import * as THREE from 'three';
import { useIsFocused } from '@react-navigation/native';

export function ThreeDForestBg() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current || !isFocused) return;

    const container = containerRef.current;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xffffff, 0.002);

    // 2. Camera Setup (Perspective for Parallax Depth)
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    camera.position.z = 220;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
    } catch (e) {
      console.warn('WebGL context creation failed:', e);
      return;
    }

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xf5f5f5, 2.0);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x0d47a1, 3, 400);
    pointLight1.position.set(-150, 100, 100);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xd32f2f, 3, 400);
    pointLight2.position.set(150, -100, 100);
    scene.add(pointLight2);

    // 5. Build Forest Particle Nodes (Organic wave structure)
    const particleCount = 140;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    // Seed parameters
    interface SeedInfo {
      x: number;
      y: number;
      z: number;
      angle: number;
      speed: number;
      amplitude: number;
    }
    const seedData: SeedInfo[] = [];

    const forestColors = [
      new THREE.Color(0x0d47a1), // Primary Blue
      new THREE.Color(0xd32f2f), // Accent Red
      new THREE.Color(0x1e88e5), // Electric Blue
      new THREE.Color(0xf44336), // Vibrant Red
      new THREE.Color(0xbbdefb), // Ice Blue
    ];

    for (let i = 0; i < particleCount; i++) {
      // Position particles in a wide 3D grid
      const x = (Math.random() - 0.5) * 600;
      const y = (Math.random() - 0.5) * 400;
      const z = (Math.random() - 0.5) * 300 - 50;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Assign random organic color from palette
      const chosenColor = forestColors[Math.floor(Math.random() * forestColors.length)];
      colors[i * 3] = chosenColor.r;
      colors[i * 3 + 1] = chosenColor.g;
      colors[i * 3 + 2] = chosenColor.b;

      seedData.push({
        x,
        y,
        z,
        angle: Math.random() * Math.PI * 2,
        speed: 0.005 + Math.random() * 0.01,
        amplitude: 15 + Math.random() * 25,
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 16);
    }
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      size: 6,
      map: texture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
    });

    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    // 6. Interactive Parallax Tracking
    let targetCameraX = 0;
    let targetCameraY = 0;
    let currentCameraX = 0;
    let currentCameraY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize coordinate: -1 to 1
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      targetCameraX = x * 45; // Camera pan amplitude
      targetCameraY = y * 30;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          width = newWidth;
          height = newHeight;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    // 7. Render Loop
    let time = 0;
    const animate = () => {
      time += 0.005;

      // Update particle positions with smooth sine wave motion
      const posAttr = geometry.attributes.position;
      if (posAttr) {
        const arr = posAttr.array as Float32Array;
        for (let i = 0; i < particleCount; i++) {
          const idx = i * 3;
          const seed = seedData[i];
          
          seed.angle += seed.speed;
          
          // Wave movement pattern
          arr[idx + 1] = seed.y + Math.sin(seed.angle + time * 10) * seed.amplitude;
          arr[idx] = seed.x + Math.cos(seed.angle + time * 5) * (seed.amplitude / 2);
        }
        posAttr.needsUpdate = true;
      }

      // Rotate particle system slowly
      particleSystem.rotation.y = time * 0.1;
      particleSystem.rotation.z = time * 0.05;

      // Parallax camera lerp
      currentCameraX += (targetCameraX - currentCameraX) * 0.05;
      currentCameraY += (targetCameraY - currentCameraY) * 0.05;

      camera.position.x = currentCameraX;
      camera.position.y = currentCameraY;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [isFocused]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF', // White base theme
    zIndex: -999, // Render at the absolute bottom
  },
});
