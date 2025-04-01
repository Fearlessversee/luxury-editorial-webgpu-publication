# Luxury Editorial Magazine & WebGPU 3D Publication

> **Enterprise Software Product by [Taliyo Technologies](https://www.taliyotechnologies.com)**  
> *Architected by Viraj Srivastav ([VirajVerse](https://github.com/virajverse))*

---

## 🌟 Executive Summary
Ultra-sleek dark-mode digital publication layout powered by Three.js WebGPU shaders, 3D GLB models, kinetic typography, and editorial visual grids.

This solution is engineered as a zero-dependency, ultra-performance standalone product ready for client deployment, white-label reselling, or enterprise integration.

- **Product Category**: `Luxury Editorial & WebGPU Tech`
- **Local Port Allocation**: `http://localhost:8872`
- **License**: `Commercial Proprietary // Taliyo Technologies`

---

## 🛠️ Architecture & Tech Stack

### Core Technologies
- **Three.js WebGPURenderer**
- **WGSL Custom Node Shaders**
- **3D GLB Mesh Deformations**
- **GSAP Kinetic Typography**
- **High-Resolution Asset Streamer**

### Key Capabilities
- Cutting-edge Three.js WebGPU rendering with custom WGSL shader pipeline
- 3D GLB model integration with real-time lighting and surface reflections
- Kinetic typography stagger effects and smooth momentum scrolling
- Editorial visual grids with responsive aspect-ratio preservation
- Modular ES module architecture (28 discrete component files)

---

## 🚀 Quick Start Guide

### 1. Zero-Config Local Launch (Windows)
Double-click `start.bat` in this folder. It initializes the local multi-threaded server and opens the application in your default browser automatically.

### 2. Node / NPM Standard Command
```bash
npm start
```

### 3. Command Line (Cross-Platform Python)
```bash
python serve.py
```
Open **[http://localhost:8872](http://localhost:8872)** in any modern web browser.

---

## 🎨 White-Label & Developer Customization

- **Step 1**: Editorial Content: Edit article headings and narrative text in `index.html` and `js/titles.js`
- **Step 2**: 3D Models: Replace `assets/crow.glb` or `assets/table.glb` with custom 3D products or artifacts
- **Step 3**: Color Palette: Update color presets in `js/palette.js`

---

## 📂 Repository Structure
```text
├── index.html              # Main application entry point & view markup
├── package.json            # Project manifest, dependencies, and lifecycle scripts
├── serve.py                # Multi-threaded zero-dependency local server
├── start.bat               # 1-click Windows desktop launcher
├── README.md               # Enterprise product documentation & setup guide
├── .gitignore              # Standard version control filter
└── [assets/ / js/ / css/]  # Localized stylesheets, scripts, fonts, 3D meshes, and media
```

---

## 🌐 Production Deployment

This project is fully static and can be deployed in seconds to any production host:
- **Vercel**: Import repository -> Framework: `Other` -> Output Directory: `.`
- **Netlify**: Drag-and-drop root folder or connect Git repository
- **Nginx / Apache / Cloudflare Pages**: Copy root directory to your web root (`/var/www/html`)

---

## 🛡️ Commercial License & Support
Copyright © 2026 **Taliyo Technologies Pvt Ltd**. All rights reserved.  
Commercial re-use, enterprise distribution, and customized builds are governed by Taliyo Technologies software licensing agreements.

For enterprise inquiries, custom feature integration, or volume licensing:
- 🌐 **Corporate Portal**: [https://www.taliyotechnologies.com](https://www.taliyotechnologies.com)
- 📧 **Direct Technical Inquiries**: [virajverse016@gmail.com](mailto:virajverse016@gmail.com)
