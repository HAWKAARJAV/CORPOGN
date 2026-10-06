import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "..", "public");

const features = [
  {
    id: 1,
    name: 'feature-1-platform',
    title: 'CSR & ESG Platform',
    desc: 'CORPOGN FEATURE 01',
    content: `
      <g transform="translate(400, 220)">
        <g class="float-slow">
          <!-- Main Dashboard Panel -->
          <rect x="-180" y="-120" width="360" height="240" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
          <!-- Sidebar -->
          <rect x="-180" y="-120" width="80" height="240" rx="12" fill="rgba(18,30,86,0.3)" />
          <line x1="-160" y1="-90" x2="-120" y2="-90" stroke="rgba(255,255,255,0.2)" stroke-width="4" stroke-linecap="round"/>
          <line x1="-160" y1="-70" x2="-130" y2="-70" stroke="rgba(255,255,255,0.2)" stroke-width="4" stroke-linecap="round"/>
          <!-- Top bar -->
          <line x1="-80" y1="-90" x2="150" y2="-90" stroke="rgba(255,255,255,0.1)" stroke-width="4" stroke-linecap="round"/>
          
          <!-- Modules (Configurable blocks) -->
          <g class="slide-in-right-1">
            <rect x="-80" y="-60" width="100" height="60" rx="8" fill="rgba(132,155,52,0.4)" stroke="#849b34" stroke-width="2"/>
            <circle cx="-60" cy="-30" r="10" fill="rgba(255,255,255,0.5)"/>
            <line x1="-40" y1="-35" x2="0" y2="-35" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-linecap="round"/>
            <line x1="-40" y1="-25" x2="-10" y2="-25" stroke="rgba(255,255,255,0.5)" stroke-width="3" stroke-linecap="round"/>
          </g>
          
          <g class="slide-in-right-2">
            <rect x="40" y="-60" width="120" height="60" rx="8" fill="rgba(18,30,86,0.5)" stroke="#121e56" stroke-width="2"/>
            <line x1="60" y1="-30" x2="140" y2="-30" stroke="rgba(255,255,255,0.3)" stroke-width="4" stroke-linecap="round"/>
          </g>

          <g class="slide-in-up">
            <rect x="-80" y="20" width="240" height="80" rx="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
            <path d="M -60,80 L -20,40 L 20,60 L 80,30 L 140,70" fill="none" stroke="#849b34" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="-20" cy="40" r="4" fill="#fff"/>
            <circle cx="20" cy="60" r="4" fill="#fff"/>
            <circle cx="80" cy="30" r="4" fill="#fff"/>
          </g>
        </g>
        <!-- Floating Config Gear -->
        <g class="spin-slow" transform="translate(180, -100)">
          <path d="M15,-5 L20,-10 L25,-5 L20,0 Z" fill="#849b34" />
          <circle cx="0" cy="0" r="25" fill="none" stroke="#849b34" stroke-width="6" stroke-dasharray="8 6"/>
          <circle cx="0" cy="0" r="12" fill="#849b34" />
        </g>
      </g>
    `
  },
  {
    id: 2,
    name: 'feature-2-mobile',
    title: 'Mobile Field Reporting',
    desc: 'CORPOGN FEATURE 02',
    content: `
      <g transform="translate(400, 220)">
        <g class="float-slow">
          <!-- Mobile Phone -->
          <rect x="-60" y="-140" width="120" height="240" rx="20" fill="rgba(18,30,86,0.8)" stroke="#ffffff" stroke-width="4"/>
          <!-- Screen -->
          <rect x="-50" y="-110" width="100" height="190" rx="8" fill="rgba(255,255,255,0.1)"/>
          <!-- Camera notch -->
          <rect x="-20" y="-130" width="40" height="8" rx="4" fill="#ffffff" opacity="0.5"/>
          
          <!-- Map Pin on Screen -->
          <g class="pulse-scale" transform="translate(0, -40)">
            <path d="M0,-20 C-15,-20 -25,-5 -25,5 C-25,25 0,40 0,40 C0,40 25,25 25,5 C25,-5 15,-20 0,-20 Z" fill="#849b34"/>
            <circle cx="0" cy="0" r="8" fill="#fff"/>
          </g>

          <!-- List Items (Beneficiaries) -->
          <g class="slide-in-up">
            <rect x="-40" y="20" width="80" height="15" rx="4" fill="rgba(255,255,255,0.3)"/>
            <rect x="-40" y="45" width="80" height="15" rx="4" fill="rgba(255,255,255,0.3)"/>
            <rect x="-40" y="70" width="60" height="15" rx="4" fill="rgba(255,255,255,0.3)"/>
          </g>
        </g>

        <!-- Wireless signals -->
        <g transform="translate(70, -80)">
          <path d="M0,0 Q20,-20 40,0" fill="none" stroke="#849b34" stroke-width="4" stroke-linecap="round" class="signal-1"/>
          <path d="M-10,-10 Q20,-40 50,-10" fill="none" stroke="#849b34" stroke-width="4" stroke-linecap="round" opacity="0.6" class="signal-2"/>
          <path d="M-20,-20 Q20,-60 60,-20" fill="none" stroke="#849b34" stroke-width="4" stroke-linecap="round" opacity="0.3" class="signal-3"/>
        </g>
        
        <!-- Cloud Sync -->
        <g transform="translate(-140, 0)" class="float-delayed">
          <path d="M0,0 C-20,0 -30,-15 -20,-30 C-25,-50 0,-60 15,-40 C30,-60 60,-45 50,-20 C65,-15 60,0 40,0 Z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          <!-- Sync arrows -->
          <path d="M10,-15 A 12 12 0 1 1 30,-15" fill="none" stroke="#849b34" stroke-width="3" stroke-linecap="round" class="spin-slow" style="transform-origin: 20px -15px;"/>
        </g>
      </g>
    `
  },
  {
    id: 3,
    name: 'feature-3-lifecycle',
    title: 'Project Lifecycle',
    desc: 'CORPOGN FEATURE 03',
    content: `
      <g transform="translate(400, 220)">
        <!-- Circular Lifecycle Arrows -->
        <g class="spin-slow" style="transform-origin: center;">
          <path d="M -80,0 A 80,80 0 0,1 0,-80" fill="none" stroke="#849b34" stroke-width="8" stroke-linecap="round"/>
          <polygon points="-5,-88 10,-80 -5,-72" fill="#849b34" transform="rotate(0)"/>
          
          <path d="M 80,0 A 80,80 0 0,1 0,80" fill="none" stroke="#121e56" stroke-width="8" stroke-linecap="round"/>
          <polygon points="5,88 -10,80 5,72" fill="#121e56" transform="rotate(0)"/>
          
          <path d="M 0,-80 A 80,80 0 0,1 80,0" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="8" stroke-linecap="round"/>
          <polygon points="88,-5 80,10 72,-5" fill="rgba(255,255,255,0.4)" />
          
          <path d="M 0,80 A 80,80 0 0,1 -80,0" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="8" stroke-linecap="round"/>
          <polygon points="-88,5 -80,-10 -72,5" fill="rgba(255,255,255,0.4)" />
        </g>

        <!-- Center Document/Checklist -->
        <g class="float-slow">
          <rect x="-40" y="-50" width="80" height="100" rx="6" fill="rgba(255,255,255,0.9)"/>
          <line x1="-20" y1="-30" x2="20" y2="-30" stroke="#121e56" stroke-width="4" stroke-linecap="round"/>
          <line x1="-20" y1="-10" x2="20" y2="-10" stroke="#121e56" stroke-width="4" stroke-linecap="round"/>
          <line x1="-20" y1="10" x2="10" y2="10" stroke="#121e56" stroke-width="4" stroke-linecap="round"/>
          <!-- Checkmark -->
          <path d="M-20,30 L-10,40 L15,15" fill="none" stroke="#849b34" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" class="draw-path"/>
        </g>
        
        <!-- Nodes -->
        <circle cx="-120" cy="-100" r="16" fill="rgba(18,30,86,0.8)" class="pulse-scale"/>
        <circle cx="120" cy="-100" r="20" fill="rgba(132,155,52,0.8)" class="pulse-scale" style="animation-delay: 1s;"/>
        <circle cx="140" cy="80" r="14" fill="rgba(255,255,255,0.3)" class="pulse-scale" style="animation-delay: 2s;"/>
        <circle cx="-130" cy="90" r="22" fill="rgba(255,255,255,0.1)" class="pulse-scale" style="animation-delay: 0.5s;"/>
      </g>
    `
  },
  {
    id: 4,
    name: 'feature-4-alignment',
    title: 'SDG & ESG Alignment',
    desc: 'CORPOGN FEATURE 04',
    content: `
      <g transform="translate(400, 220)">
        <!-- Overlapping Venn Diagram / Target -->
        <g class="float-slow">
          <circle cx="-40" cy="-20" r="70" fill="rgba(18,30,86,0.6)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
          <circle cx="40" cy="-20" r="70" fill="rgba(132,155,52,0.6)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
          <circle cx="0" cy="50" r="70" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
          <!-- Intersection highlighted -->
          <path d="M -30,20 A 70,70 0 0,0 30,20 A 70,70 0 0,0 0,-40 A 70,70 0 0,0 -30,20 Z" fill="#ffffff" opacity="0.3" class="pulse-opacity"/>
          
          <text x="0" y="10" font-family="sans-serif" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">ESG</text>
        </g>

        <!-- SDG Grid blocks on the sides -->
        <g class="slide-in-right-1" transform="translate(140, -80)">
          <rect x="0" y="0" width="30" height="30" rx="4" fill="#e5243b"/>
          <rect x="35" y="0" width="30" height="30" rx="4" fill="#dda63a"/>
          <rect x="0" y="35" width="30" height="30" rx="4" fill="#4c9f38"/>
          <rect x="35" y="35" width="30" height="30" rx="4" fill="#c5192d"/>
        </g>
        
        <g class="slide-in-left-1" transform="translate(-200, 20)">
          <rect x="0" y="0" width="30" height="30" rx="4" fill="#ff3a21"/>
          <rect x="35" y="0" width="30" height="30" rx="4" fill="#26bde2"/>
          <rect x="0" y="35" width="30" height="30" rx="4" fill="#fcc30b"/>
          <rect x="35" y="35" width="30" height="30" rx="4" fill="#a21942"/>
        </g>
      </g>
    `
  },
  {
    id: 5,
    name: 'feature-5-gis',
    title: 'GIS & Planning',
    desc: 'CORPOGN FEATURE 05',
    content: `
      <g transform="translate(400, 220)">
        <!-- Isometric Map Base -->
        <g transform="scale(1, 0.5) rotate(45)" class="float-slow">
          <!-- Map Grid -->
          <rect x="-150" y="-150" width="300" height="300" rx="10" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
          <line x1="-100" y1="-150" x2="-100" y2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line x1="-50" y1="-150" x2="-50" y2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line x1="0" y1="-150" x2="0" y2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line x1="50" y1="-150" x2="50" y2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line x1="100" y1="-150" x2="100" y2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          
          <line y1="-100" x1="-150" y2="-100" x2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line y1="-50" x1="-150" y2="-50" x2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line y1="0" x1="-150" y2="0" x2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line y1="50" x1="-150" y2="50" x2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line y1="100" x1="-150" y2="100" x2="150" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          
          <!-- Highlighted Regions -->
          <rect x="-100" y="0" width="50" height="100" fill="rgba(132,155,52,0.4)"/>
          <rect x="0" y="-100" width="100" height="50" fill="rgba(18,30,86,0.5)"/>
        </g>

        <!-- Location Pins -->
        <g class="bounce" transform="translate(0, -50)">
          <path d="M0,-30 C-15,-30 -25,-15 -25,-5 C-25,15 0,30 0,30 C0,30 25,15 25,-5 C25,-15 15,-30 0,-30 Z" fill="#849b34"/>
          <circle cx="0" cy="-10" r="8" fill="#fff"/>
          <!-- Radar Rings -->
          <ellipse cx="0" cy="40" rx="30" ry="10" fill="none" stroke="#849b34" stroke-width="2" class="radar-ping-1"/>
          <ellipse cx="0" cy="40" rx="50" ry="16" fill="none" stroke="#849b34" stroke-width="2" class="radar-ping-2"/>
        </g>
        
        <g class="bounce" transform="translate(-80, 20)" style="animation-delay: 0.5s;">
          <path d="M0,-20 C-10,-20 -16,-10 -16,-3 C-16,10 0,20 0,20 C0,20 16,10 16,-3 C16,-10 10,-20 0,-20 Z" fill="#121e56"/>
          <circle cx="0" cy="-6" r="5" fill="#fff"/>
        </g>

        <g class="bounce" transform="translate(90, 0)" style="animation-delay: 1s;">
          <path d="M0,-20 C-10,-20 -16,-10 -16,-3 C-16,10 0,20 0,20 C0,20 16,10 16,-3 C16,-10 10,-20 0,-20 Z" fill="#ffffff"/>
          <circle cx="0" cy="-6" r="5" fill="#849b34"/>
        </g>
      </g>
    `
  },
  {
    id: 6,
    name: 'feature-6-analytics',
    title: 'Impact Analytics',
    desc: 'CORPOGN FEATURE 06',
    content: `
      <g transform="translate(400, 220)">
        <g class="float-slow">
          <!-- Main Chart Area -->
          <rect x="-180" y="-120" width="360" height="240" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
          <!-- Grid Lines -->
          <line x1="-140" y1="60" x2="140" y2="60" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line x1="-140" y1="0" x2="140" y2="0" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          <line x1="-140" y1="-60" x2="140" y2="-60" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
          
          <!-- Bar Charts -->
          <g class="bar-grow-1"><rect x="-120" y="0" width="30" height="60" rx="4" fill="rgba(255,255,255,0.4)"/></g>
          <g class="bar-grow-2"><rect x="-70" y="-30" width="30" height="90" rx="4" fill="rgba(18,30,86,0.8)"/></g>
          <g class="bar-grow-3"><rect x="-20" y="-10" width="30" height="70" rx="4" fill="rgba(255,255,255,0.6)"/></g>
          <g class="bar-grow-4"><rect x="30" y="-70" width="30" height="130" rx="4" fill="#849b34"/></g>
          <g class="bar-grow-5"><rect x="80" y="-40" width="30" height="100" rx="4" fill="rgba(132,155,52,0.6)"/></g>

          <!-- Trend Line -->
          <path d="M-105,10 L-55,-40 L-5,-20 L45,-80 L95,-60" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="draw-path" style="animation-duration: 4s;"/>
          
          <!-- Nodes on line -->
          <circle cx="-105" cy="10" r="6" fill="#849b34" stroke="#fff" stroke-width="2" class="pulse-opacity" style="animation-delay: 0s;"/>
          <circle cx="-55" cy="-40" r="6" fill="#849b34" stroke="#fff" stroke-width="2" class="pulse-opacity" style="animation-delay: 0.5s;"/>
          <circle cx="-5" cy="-20" r="6" fill="#849b34" stroke="#fff" stroke-width="2" class="pulse-opacity" style="animation-delay: 1s;"/>
          <circle cx="45" cy="-80" r="6" fill="#849b34" stroke="#fff" stroke-width="2" class="pulse-opacity" style="animation-delay: 1.5s;"/>
          <circle cx="95" cy="-60" r="6" fill="#849b34" stroke="#fff" stroke-width="2" class="pulse-opacity" style="animation-delay: 2s;"/>
        </g>
        
        <!-- Floating Pie Chart -->
        <g class="float-delayed" transform="translate(140, -100)">
          <circle cx="0" cy="0" r="40" fill="rgba(18,30,86,0.9)" stroke="#fff" stroke-width="2"/>
          <path d="M0,0 L0,-40 A40,40 0 0,1 35,-20 Z" fill="#849b34"/>
          <path d="M0,0 L35,-20 A40,40 0 0,1 25,31 Z" fill="rgba(255,255,255,0.7)"/>
        </g>
      </g>
    `
  },
  {
    id: 7,
    name: 'feature-7-ngo',
    title: 'NGO Due Diligence',
    desc: 'CORPOGN FEATURE 07',
    content: `
      <g transform="translate(400, 220)">
        <g class="float-slow">
          <!-- Central Shield/Document -->
          <rect x="-80" y="-100" width="160" height="200" rx="10" fill="rgba(255,255,255,0.9)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          <rect x="-60" y="-70" width="120" height="15" rx="4" fill="#e0e0e0"/>
          <rect x="-60" y="-40" width="80" height="10" rx="4" fill="#e0e0e0"/>
          
          <rect x="-60" y="-10" width="120" height="15" rx="4" fill="#e0e0e0"/>
          <rect x="-60" y="20" width="90" height="10" rx="4" fill="#e0e0e0"/>

          <!-- Approval Stamp -->
          <g class="stamp-anim" transform="translate(20, 50)">
            <circle cx="0" cy="0" r="30" fill="none" stroke="#849b34" stroke-width="6" stroke-dasharray="10 5"/>
            <circle cx="0" cy="0" r="20" fill="none" stroke="#849b34" stroke-width="2"/>
            <path d="M-10,0 L-5,8 L15,-10" fill="none" stroke="#849b34" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          </g>
        </g>

        <!-- Rating Dial / Score -->
        <g class="float-delayed" transform="translate(-140, -40)">
          <rect x="-60" y="-60" width="120" height="120" rx="16" fill="rgba(18,30,86,0.8)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
          <!-- Half circle track -->
          <path d="M-40,20 A 40,40 0 1,1 40,20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="12" stroke-linecap="round"/>
          <!-- Filled track -->
          <path d="M-40,20 A 40,40 0 1,1 30,-20" fill="none" stroke="#849b34" stroke-width="12" stroke-linecap="round" class="draw-path" style="animation-duration: 3s;"/>
          <!-- Needle -->
          <g class="spin-slow" style="transform-origin: 0 20px; animation-duration: 6s; animation-direction: alternate;">
            <circle cx="0" cy="20" r="8" fill="#fff"/>
            <polygon points="-4,20 4,20 0,-25" fill="#fff"/>
          </g>
          <text x="0" y="5" font-family="sans-serif" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">98%</text>
        </g>

        <!-- Handshake / Partner icon simplified -->
        <g class="slide-in-right-1" transform="translate(140, 20)">
          <circle cx="0" cy="0" r="50" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          <path d="M-20,-10 L0,10 L30,-20" fill="none" stroke="#849b34" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" class="draw-path"/>
          <path d="M-20,10 L0,30 L30,0" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" class="draw-path" style="animation-delay: 1s;"/>
        </g>
      </g>
    `
  },
  {
    id: 8,
    name: 'feature-8-volunteer',
    title: 'Volunteer Management',
    desc: 'CORPOGN FEATURE 08',
    content: `
      <g transform="translate(400, 220)">
        <g class="float-slow">
          <!-- Central Heart -->
          <g class="pulse-scale">
            <path d="M0,20 C 0,20 -40,-10 -40,-40 C -40,-60 -20,-70 0,-50 C 20,-70 40,-60 40,-40 C 40,-10 0,20 0,20 Z" fill="#849b34" filter="drop-shadow(0 0 10px rgba(132,155,52,0.5))"/>
          </g>
          
          <!-- Surrounding Volunteers (Abstract shapes) -->
          <!-- Top Left -->
          <g transform="translate(-70, -70)" class="float-delayed">
            <circle cx="0" cy="-15" r="15" fill="rgba(255,255,255,0.9)"/>
            <path d="M-25,20 C-25,5 25,5 25,20 Z" fill="rgba(255,255,255,0.9)"/>
          </g>
          <!-- Top Right -->
          <g transform="translate(70, -70)" class="float-delayed" style="animation-delay: 1s;">
            <circle cx="0" cy="-12" r="12" fill="rgba(18,30,86,0.9)"/>
            <path d="M-20,15 C-20,5 20,5 20,15 Z" fill="rgba(18,30,86,0.9)"/>
          </g>
          <!-- Bottom Left -->
          <g transform="translate(-90, 30)" class="float-delayed" style="animation-delay: 2s;">
            <circle cx="0" cy="-12" r="12" fill="rgba(255,255,255,0.5)"/>
            <path d="M-20,15 C-20,5 20,5 20,15 Z" fill="rgba(255,255,255,0.5)"/>
          </g>
          <!-- Bottom Right -->
          <g transform="translate(90, 30)" class="float-delayed" style="animation-delay: 1.5s;">
            <circle cx="0" cy="-15" r="15" fill="rgba(255,255,255,0.8)"/>
            <path d="M-25,20 C-25,5 25,5 25,20 Z" fill="rgba(255,255,255,0.8)"/>
          </g>
          <!-- Bottom Center -->
          <g transform="translate(0, 90)" class="float-delayed" style="animation-delay: 0.5s;">
            <circle cx="0" cy="-18" r="18" fill="rgba(132,155,52,0.9)"/>
            <path d="M-30,25 C-30,5 30,5 30,25 Z" fill="rgba(132,155,52,0.9)"/>
          </g>
        </g>
        
        <!-- Connecting lines -->
        <g stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="6 6" class="spin-slow" style="transform-origin: center;">
          <circle cx="0" cy="0" r="110" fill="none"/>
        </g>
      </g>
    `
  },
  {
    id: 9,
    name: 'feature-9-ai',
    title: 'AI Intelligence',
    desc: 'CORPOGN FEATURE 09',
    content: `
      <g transform="translate(400, 220)">
        <!-- Neural Network / Brain -->
        <g class="float-slow">
          <!-- Hexagon Grid Background -->
          <path d="M0,-80 L70,-40 L70,40 L0,80 L-70,40 L-70,-40 Z" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
          <path d="M0,-120 L105,-60 L105,60 L0,120 L-105,60 L-105,-60 Z" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
          
          <!-- Connections -->
          <line x1="0" y1="0" x2="-40" y2="-40" stroke="#849b34" stroke-width="3" class="pulse-opacity"/>
          <line x1="0" y1="0" x2="40" y2="-50" stroke="#ffffff" stroke-width="3" class="pulse-opacity" style="animation-delay: 0.2s;"/>
          <line x1="0" y1="0" x2="50" y2="20" stroke="#849b34" stroke-width="3" class="pulse-opacity" style="animation-delay: 0.4s;"/>
          <line x1="0" y1="0" x2="-30" y2="50" stroke="#ffffff" stroke-width="3" class="pulse-opacity" style="animation-delay: 0.6s;"/>
          <line x1="-40" y1="-40" x2="40" y2="-50" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          <line x1="40" y1="-50" x2="50" y2="20" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          <line x1="50" y1="20" x2="-30" y2="50" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          <line x1="-30" y1="50" x2="-40" y2="-40" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
          
          <line x1="-40" y1="-40" x2="-80" y2="-20" stroke="#849b34" stroke-width="2" class="pulse-opacity"/>
          <line x1="40" y1="-50" x2="70" y2="-80" stroke="#ffffff" stroke-width="2" class="pulse-opacity"/>
          <line x1="50" y1="20" x2="90" y2="40" stroke="#849b34" stroke-width="2" class="pulse-opacity"/>
          <line x1="-30" y1="50" x2="-60" y2="90" stroke="#ffffff" stroke-width="2" class="pulse-opacity"/>

          <!-- Nodes -->
          <circle cx="0" cy="0" r="16" fill="#121e56" stroke="#fff" stroke-width="3"/>
          <circle cx="0" cy="0" r="6" fill="#849b34" class="pulse-scale"/>
          
          <circle cx="-40" cy="-40" r="10" fill="#849b34"/>
          <circle cx="40" cy="-50" r="12" fill="#ffffff"/>
          <circle cx="50" cy="20" r="10" fill="#849b34"/>
          <circle cx="-30" cy="50" r="12" fill="#ffffff"/>

          <circle cx="-80" cy="-20" r="6" fill="rgba(255,255,255,0.5)"/>
          <circle cx="70" cy="-80" r="8" fill="rgba(132,155,52,0.8)"/>
          <circle cx="90" cy="40" r="6" fill="rgba(255,255,255,0.5)"/>
          <circle cx="-60" cy="90" r="8" fill="rgba(132,155,52,0.8)"/>
        </g>
        
        <!-- Magic Sparkles -->
        <g class="bounce" transform="translate(-120, -80)">
          <path d="M0,-15 Q0,0 15,0 Q0,0 0,15 Q0,0 -15,0 Q0,0 0,-15 Z" fill="#849b34"/>
        </g>
        <g class="bounce" transform="translate(140, 60)" style="animation-delay: 1s;">
          <path d="M0,-20 Q0,0 20,0 Q0,0 0,20 Q0,0 -20,0 Q0,0 0,-20 Z" fill="#ffffff"/>
        </g>
      </g>
    `
  },
  {
    id: 10,
    name: 'feature-10-audit',
    title: 'Audit & Compliance',
    desc: 'CORPOGN FEATURE 10',
    content: `
      <g transform="translate(400, 220)">
        <g class="float-slow">
          <!-- Main Shield -->
          <path d="M0,-120 C 50,-120 90,-100 110,-80 C 110,0 80,90 0,140 C -80,90 -110,0 -110,-80 C -90,-100 -50,-120 0,-120 Z" fill="rgba(18,30,86,0.8)" stroke="rgba(255,255,255,0.3)" stroke-width="4"/>
          <!-- Inner Shield Detail -->
          <path d="M0,-100 C 40,-100 70,-85 85,-70 C 85,-5 60,70 0,110 C -60,70 -85,-5 -85,-70 C -70,-85 -40,-100 0,-100 Z" fill="rgba(255,255,255,0.05)" stroke="rgba(132,155,52,0.8)" stroke-width="2"/>
          
          <!-- Central Checkmark Document -->
          <rect x="-40" y="-60" width="80" height="100" rx="6" fill="#ffffff" filter="drop-shadow(0 10px 10px rgba(0,0,0,0.3))"/>
          <line x1="-20" y1="-40" x2="20" y2="-40" stroke="#e0e0e0" stroke-width="4" stroke-linecap="round"/>
          <line x1="-20" y1="-25" x2="20" y2="-25" stroke="#e0e0e0" stroke-width="4" stroke-linecap="round"/>
          
          <path d="M-15,10 L-5,20 L25,-10" fill="none" stroke="#849b34" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" class="draw-path" style="animation-duration: 4s;"/>
        </g>
        
        <!-- Padlock Floating -->
        <g class="float-delayed" transform="translate(120, -50)">
          <rect x="-20" y="0" width="40" height="30" rx="6" fill="#849b34"/>
          <path d="M-10,0 L-10,-10 C-10,-18 10,-18 10,-10 L10,0" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
          <circle cx="0" cy="15" r="4" fill="#121e56"/>
        </g>
        
        <!-- Magnifying Glass / Audit tool -->
        <g class="float-delayed" transform="translate(-100, 60)" style="animation-delay: 1s;">
          <circle cx="0" cy="0" r="25" fill="rgba(255,255,255,0.2)" stroke="#ffffff" stroke-width="6"/>
          <line x1="18" y1="18" x2="40" y2="40" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
          <circle cx="0" cy="0" r="15" fill="rgba(132,155,52,0.3)"/>
        </g>
      </g>
    `
  }
];

const cssStyles = \`
  .float-slow { animation: float 6s ease-in-out infinite; }
  .float-delayed { animation: float 6s ease-in-out infinite; animation-delay: -3s; }
  .spin-slow { animation: spin 20s linear infinite; transform-origin: center; }
  .pulse-opacity { animation: pulseOpacity 2s infinite alternate; }
  .pulse-scale { animation: pulseScale 2s infinite alternate; transform-origin: center; }
  .bounce { animation: bounce 3s ease-in-out infinite; }
  
  .slide-in-right-1 { animation: slideRight 4s infinite alternate ease-in-out; }
  .slide-in-right-2 { animation: slideRight 5s infinite alternate ease-in-out; animation-delay: 1s; }
  .slide-in-left-1 { animation: slideLeft 4s infinite alternate ease-in-out; }
  .slide-in-up { animation: slideUp 5s infinite alternate ease-in-out; }
  
  .bar-grow-1 { animation: growY 3s infinite alternate ease-in-out; transform-origin: bottom; }
  .bar-grow-2 { animation: growY 4s infinite alternate ease-in-out; transform-origin: bottom; }
  .bar-grow-3 { animation: growY 2.5s infinite alternate ease-in-out; transform-origin: bottom; }
  .bar-grow-4 { animation: growY 3.5s infinite alternate ease-in-out; transform-origin: bottom; }
  .bar-grow-5 { animation: growY 4.5s infinite alternate ease-in-out; transform-origin: bottom; }

  .draw-path { stroke-dasharray: 400; stroke-dashoffset: 400; animation: draw 4s infinite alternate ease-in-out; }
  .stamp-anim { animation: stamp 4s infinite; }
  
  .signal-1 { animation: signal 2s infinite; }
  .signal-2 { animation: signal 2s infinite; animation-delay: 0.3s; }
  .signal-3 { animation: signal 2s infinite; animation-delay: 0.6s; }
  
  .radar-ping-1 { animation: radar 3s infinite; transform-origin: center; }
  .radar-ping-2 { animation: radar 3s infinite; animation-delay: 1.5s; transform-origin: center; }

  @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-15px); } 100% { transform: translateY(0px); } }
  @keyframes spin { 100% { transform: rotate(360deg); } }
  @keyframes pulseOpacity { 0% { opacity: 0.3; } 100% { opacity: 1; } }
  @keyframes pulseScale { 0% { transform: scale(0.9); } 100% { transform: scale(1.1); } }
  @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
  
  @keyframes slideRight { 0% { transform: translateX(0); } 100% { transform: translateX(20px); } }
  @keyframes slideLeft { 0% { transform: translateX(0); } 100% { transform: translateX(-20px); } }
  @keyframes slideUp { 0% { transform: translateY(0); } 100% { transform: translateY(-15px); } }
  
  @keyframes growY { 0% { transform: scaleY(0.4); } 100% { transform: scaleY(1); } }
  @keyframes draw { 0% { stroke-dashoffset: 400; } 100% { stroke-dashoffset: 0; } }
  
  @keyframes stamp { 0% { transform: translate(20px, 50px) scale(2); opacity: 0; } 20% { transform: translate(20px, 50px) scale(1); opacity: 1; } 80% { transform: translate(20px, 50px) scale(1); opacity: 1; } 100% { transform: translate(20px, 50px) scale(1); opacity: 0; } }
  
  @keyframes signal { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes radar { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
\`;

features.forEach(feature => {
  const svgContent = \`<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0b1338;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#121e56;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2a3a7c;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#121e56;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#849b34;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.25" />
    </filter>
    <style>
      \${cssStyles}
    </style>
  </defs>
  
  <!-- Premium Background -->
  <rect width="800" height="500" fill="url(#bgGrad)" />
  
  <!-- Abstract Shapes Background -->
  <path d="M-100,-100 L300,500 L900,-100 Z" fill="rgba(132,155,52,0.03)" />
  <circle cx="700" cy="400" r="350" fill="rgba(255,255,255,0.02)" />
  <circle cx="100" cy="450" r="200" fill="rgba(132,155,52,0.04)" />
  
  <path d="M0,50 Q400,100 800,20" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="40"/>
  <path d="M0,450 Q400,380 800,480" fill="none" stroke="rgba(132,155,52,0.03)" stroke-width="60"/>
  <path d="M-50,250 Q400,150 850,300" fill="none" stroke="rgba(255,255,255,0.01)" stroke-width="120"/>

  <!-- Content -->
  \${feature.content}

  <!-- Typography -->
  <text x="400" y="430" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.5" filter="url(#shadow)">\${feature.title}</text>
  <text x="400" y="470" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="rgba(132,155,52,0.9)" text-anchor="middle" letter-spacing="4">\${feature.desc}</text>
</svg>
\`;

  const filePath = path.join(publicDir, \`\${feature.name}.svg\`);
  fs.writeFileSync(filePath, svgContent, 'utf8');
  console.log(\`Generated \${feature.name}.svg\`);
});
