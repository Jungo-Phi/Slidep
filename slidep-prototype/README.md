# Slidep Interactive Prototype

This is an interactive prototype for Slidep, a web-based mechanical design tool that allows users to create and simulate mechanisms intuitively.

## Features

### Critical User Flows Tested

1. **Creating the First Mechanism**

   - Start with empty canvas
   - Select elements from the palette (bars, joints, motors, springs)
   - Click on canvas to place elements
   - See immediate visual feedback

2. **Iterating on Mechanisms**

   - Click on elements to select them
   - Use the properties panel to modify length, rotation
   - See changes reflected immediately on canvas
   - Delete elements as needed

3. **Sharing with Community**
   - Click "Share" button to open community gallery
   - Browse sample designs
   - Load existing designs to iterate upon

### Interactive Elements

- **Canvas**: Main drawing area with grid background
- **Element Palette**: Drag-and-drop style element selection
- **Properties Panel**: Real-time editing of selected elements
- **Simulation Controls**: Play/pause/reset mechanism animation
- **Navigation**: Switch between Create, Iterate, and Share modes
- **Gallery Modal**: Community sharing interface

## Technical Implementation

- **HTML5 Canvas** for drawing and interaction
- **Vanilla JavaScript** for logic and event handling
- **CSS** with MUI-inspired design system
- **Responsive design** for desktop and mobile

## Running the Prototype

1. Start a local web server:

   ```bash
   cd slidep-prototype
   python -m http.server 8000
   ```

2. Open `http://localhost:8000` in your browser

## User Testing Instructions

### Flow 1: Creating First Mechanism

1. Click on an element type in the palette (e.g., "Bar")
2. Click on the canvas to place the element
3. Repeat with different elements to build a mechanism
4. Click "Play" to see basic animation

### Flow 2: Iterating

1. Click on an existing element to select it
2. Use the properties panel to change length or rotation
3. See changes update in real-time
4. Try the simulation with different settings

### Flow 3: Sharing

1. Click the "Share" button in navigation
2. Browse the sample community designs
3. Click "Load" on any design to import it
4. Modify and iterate on the loaded design

## Design System

Based on the UX specification, this prototype uses:

- Primary blue (#1976d2) for actions and selections
- Secondary green (#4caf50) for success states
- Accent orange (#ff9800) for creative elements
- Clean, minimal interface following MUI patterns
- Responsive layout for different screen sizes

## Limitations

This is a functional prototype demonstrating core interactions. Real physics simulation, advanced 3D rendering, and full community features would be implemented in the actual product.
