import React, { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import * as THREE from 'three';

interface Props {
  activeIndex: number;
  hoveredIndex: number | null;
  tabCount: number;
  mouseX: number;
  mouseY: number;
  isHovered: boolean;
}

export function ThreeDNavBarBg({ activeIndex, hoveredIndex, tabCount, mouseX, mouseY, isHovered }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 64;

    // 1. Scene setup
    const scene = new THREE.Scene();

    // 2. Camera setup - Orthographic matching pixel coordinates
    const camera = new THREE.OrthographicCamera(
      -width / 2, width / 2,
      height / 2, -height / 2,
      1, 1000
    );
    camera.position.z = 100;

    // 3. WebGLRenderer setup
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00d2ff, 2, 300);
    pointLight.position.set(0, 0, 50);
    scene.add(pointLight);

    const spotLight = new THREE.SpotLight(0xff00ff, 3, 200, Math.PI / 4, 0.5, 1);
    spotLight.position.set(0, 0, 80);
    scene.add(spotLight);

    // 5. Rotating 3D Mesh (Torus Knot) acting as active indicator glow
    const torusGeom = new THREE.TorusKnotGeometry(12, 3.5, 64, 8);
    const torusMat = new THREE.MeshPhongMaterial({
      color: 0x00d2ff,
      emissive: 0x0a1128,
      specular: 0xffffff,
      shininess: 100,
      flatShading: false,
    });
    const torusMesh = new THREE.Mesh(torusGeom, torusMat);
    scene.add(torusMesh);

    // 6. Floating particle system
    const particleCount = 45;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      // Spawn particles across the width/height
      const px = (Math.random() - 0.5) * width;
      const py = (Math.random() - 0.5) * height;
      const pz = (Math.random() - 0.5) * 20;

      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;

      originalPositions[i * 3] = px;
      originalPositions[i * 3 + 1] = py;
      originalPositions[i * 3 + 2] = pz;

      // Random float speeds
      velocities[i * 3] = (Math.random() - 0.5) * 0.4;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
      velocities[i * 3 + 2] = 0;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Create soft particle textures
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 16);
    }
    const particleTexture = new THREE.CanvasTexture(canvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: 4.5,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xd32f2f, // Brand red sparkles
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // 7. Animation State Variables
    let currentMeshX = 0;
    let time = 0;

    // Handle container resizing
    const handleResize = () => {
      if (!container || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 8. Animation loop
    const animate = () => {
      time += 0.015;

      const w = container.clientWidth || 400;
      const h = container.clientHeight || 64;

      // Determine active target X position in screen pixels
      const targetIndex = hoveredIndex !== null ? hoveredIndex : activeIndex;
      const segmentWidth = w / tabCount;
      const targetPixelX = (targetIndex + 0.5) * segmentWidth;
      // Convert to WebGL centered coordinates
      const targetWebGLX = targetPixelX - w / 2;

      // Smooth horizontal interpolation (lerp)
      currentMeshX += (targetWebGLX - currentMeshX) * 0.12;

      // Update Mesh positions & colors
      torusMesh.position.x = currentMeshX;
      torusMesh.position.y = Math.sin(time * 2.5) * 2; // subtle float
      torusMesh.rotation.x += 0.02;
      torusMesh.rotation.y += 0.015;

      // Animate Light following the mesh
      pointLight.position.x = currentMeshX;
      pointLight.position.y = torusMesh.position.y;

      // Shift mesh color based on active/hovered state
      const colors = [0x0d47a1, 0xd32f2f, 0x0d47a1, 0xd32f2f];
      const activeColor = colors[targetIndex % colors.length];
      torusMat.color.lerp(new THREE.Color(activeColor), 0.1);
      pointLight.color.lerp(new THREE.Color(activeColor), 0.1);

      // Mouse interactive spot light tracking
      if (isHovered) {
        const mouseWebGLX = mouseX - w / 2;
        const mouseWebGLY = h / 2 - mouseY;
        spotLight.position.x += (mouseWebGLX - spotLight.position.x) * 0.1;
        spotLight.position.y += (mouseWebGLY - spotLight.position.y) * 0.1;
        spotLight.intensity = 4;
      } else {
        spotLight.intensity = THREE.MathUtils.lerp(spotLight.intensity, 0, 0.05);
      }

      // Animate particles
      const posAttr = particleGeometry.attributes.position;
      if (posAttr) {
        const arr = posAttr.array as Float32Array;
        
        for (let i = 0; i < particleCount; i++) {
          const idx = i * 3;
          
          // Gentle drift velocity
          arr[idx] += velocities[idx];
          arr[idx + 1] += velocities[idx + 1];

          // Wrap particles around borders
          if (Math.abs(arr[idx]) > w / 2 + 10) {
            arr[idx] = -Math.sign(arr[idx]) * (w / 2);
          }
          if (Math.abs(arr[idx + 1]) > h / 2 + 5) {
            arr[idx + 1] = -Math.sign(arr[idx + 1]) * (h / 2);
          }

          // Cursor attraction
          if (isHovered) {
            const mouseWebGLX = mouseX - w / 2;
            const mouseWebGLY = h / 2 - mouseY;
            const dx = mouseWebGLX - arr[idx];
            const dy = mouseWebGLY - arr[idx + 1];
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 70) {
              const pull = (70 - dist) * 0.003;
              arr[idx] += dx * pull;
              arr[idx + 1] += dy * pull;
            }
          }
        }
        posAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      torusGeom.dispose();
      torusMat.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      particleTexture.dispose();
    };
  }, [activeIndex, hoveredIndex, tabCount, mouseX, mouseY, isHovered]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View 
      style={styles.container} 
      pointerEvents="none"
    >
      <div 
        ref={containerRef} 
        style={{ width: '100%', height: '100%', position: 'absolute', overflow: 'hidden' }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
});
