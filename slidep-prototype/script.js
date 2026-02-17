// Slidep Prototype - Interactive Mechanical Design Tool

class SlidepPrototype {
  constructor() {
    this.canvas = document.getElementById("mechanismCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.elements = [];
    this.selectedElement = null;
    this.isSimulating = false;
    this.animationId = null;
    this.selectedTool = null;
    this.gallery = [];

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupCanvas();
    this.loadSampleGallery();
    this.draw();
  }

  setupEventListeners() {
    // Navigation
    document
      .getElementById("createBtn")
      .addEventListener("click", () => this.switchMode("create"));
    document
      .getElementById("iterateBtn")
      .addEventListener("click", () => this.switchMode("iterate"));
    document
      .getElementById("shareBtn")
      .addEventListener("click", () => this.showGallery());

    // Element palette
    document.querySelectorAll(".element-item").forEach((item) => {
      item.addEventListener("click", () => this.selectTool(item.dataset.type));
    });

    // Simulation controls
    document
      .getElementById("playBtn")
      .addEventListener("click", () => this.startSimulation());
    document
      .getElementById("pauseBtn")
      .addEventListener("click", () => this.pauseSimulation());
    document
      .getElementById("resetBtn")
      .addEventListener("click", () => this.resetSimulation());

    // Gallery modal
    document
      .querySelector(".close")
      .addEventListener("click", () => this.hideGallery());
    window.addEventListener("click", (e) => {
      if (e.target === document.getElementById("galleryModal")) {
        this.hideGallery();
      }
    });
  }

  setupCanvas() {
    this.canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    this.canvas.addEventListener("mouseup", () => this.handleMouseUp());

    // Resize canvas to fit container
    const resizeCanvas = () => {
      const container = this.canvas.parentElement;
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight - 80; // Account for controls
      this.draw();
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
  }

  selectTool(type) {
    this.selectedTool = type;
    document.querySelectorAll(".element-item").forEach((item) => {
      item.classList.remove("selected");
    });
    document.querySelector(`[data-type="${type}"]`).classList.add("selected");
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.selectedTool) {
      this.addElement(this.selectedTool, x, y);
    } else {
      // Check if clicking on existing element
      const clickedElement = this.getElementAt(x, y);
      if (clickedElement) {
        this.selectElement(clickedElement);
      } else {
        this.deselectElement();
      }
    }
  }

  handleMouseMove(e) {
    // Handle dragging if needed
  }

  handleMouseUp() {
    // Handle drag end if needed
  }

  addElement(type, x, y) {
    const element = {
      id: Date.now(),
      type: type,
      x: x,
      y: y,
      rotation: 0,
      length: 100,
      selected: false,
    };

    this.elements.push(element);
    this.selectElement(element);
    this.draw();
  }

  getElementAt(x, y) {
    return this.elements.find((element) => {
      const dx = x - element.x;
      const dy = y - element.y;
      return Math.sqrt(dx * dx + dy * dy) < 20; // Click tolerance
    });
  }

  selectElement(element) {
    this.deselectElement();
    element.selected = true;
    this.selectedElement = element;
    this.updatePropertiesPanel();
  }

  deselectElement() {
    if (this.selectedElement) {
      this.selectedElement.selected = false;
    }
    this.selectedElement = null;
    this.updatePropertiesPanel();
  }

  updatePropertiesPanel() {
    const panel = document.getElementById("propertiesContent");

    if (!this.selectedElement) {
      panel.innerHTML = "<p>Select an element to edit its properties</p>";
      return;
    }

    const element = this.selectedElement;
    panel.innerHTML = `
            <div class="property-group">
                <label>Type: ${element.type}</label>
            </div>
            <div class="property-group">
                <label for="length">Length:</label>
                <input type="number" id="length" value="${element.length}" min="10" max="300">
            </div>
            <div class="property-group">
                <label for="rotation">Rotation:</label>
                <input type="number" id="rotation" value="${element.rotation}" min="0" max="360">
            </div>
            <button id="deleteBtn">Delete Element</button>
        `;

    // Add event listeners for property changes
    document.getElementById("length").addEventListener("input", (e) => {
      element.length = parseInt(e.target.value);
      this.draw();
    });

    document.getElementById("rotation").addEventListener("input", (e) => {
      element.rotation = parseInt(e.target.value);
      this.draw();
    });

    document.getElementById("deleteBtn").addEventListener("click", () => {
      this.deleteElement(element);
    });
  }

  deleteElement(element) {
    this.elements = this.elements.filter((e) => e.id !== element.id);
    this.deselectElement();
    this.draw();
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw elements
    this.elements.forEach((element) => {
      this.drawElement(element);
    });
  }

  drawGrid() {
    this.ctx.strokeStyle = "#f0f0f0";
    this.ctx.lineWidth = 1;

    for (let x = 0; x < this.canvas.width; x += 20) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    for (let y = 0; y < this.canvas.height; y += 20) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }

  drawElement(element) {
    this.ctx.save();
    this.ctx.translate(element.x, element.y);
    this.ctx.rotate((element.rotation * Math.PI) / 180);

    // Set color based on selection
    this.ctx.strokeStyle = element.selected ? "#1976d2" : "#616161";
    this.ctx.lineWidth = element.selected ? 3 : 2;

    switch (element.type) {
      case "bar":
        this.drawBar(element);
        break;
      case "joint":
        this.drawJoint(element);
        break;
      case "motor":
        this.drawMotor(element);
        break;
      case "spring":
        this.drawSpring(element);
        break;
    }

    this.ctx.restore();
  }

  drawBar(element) {
    this.ctx.beginPath();
    this.ctx.moveTo(-element.length / 2, 0);
    this.ctx.lineTo(element.length / 2, 0);
    this.ctx.stroke();

    // Draw endpoints
    this.ctx.beginPath();
    this.ctx.arc(-element.length / 2, 0, 5, 0, 2 * Math.PI);
    this.ctx.arc(element.length / 2, 0, 5, 0, 2 * Math.PI);
    this.ctx.fillStyle = "#4caf50";
    this.ctx.fill();
  }

  drawJoint(element) {
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 15, 0, 2 * Math.PI);
    this.ctx.stroke();
    this.ctx.fillStyle = "#ff9800";
    this.ctx.fill();
  }

  drawMotor(element) {
    // Draw gear shape
    this.ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const radius = i % 2 === 0 ? 20 : 15;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.fillStyle = "#f44336";
    this.ctx.fill();
  }

  drawSpring(element) {
    this.ctx.beginPath();
    const amplitude = 5;
    const frequency = 0.1;
    for (let x = -element.length / 2; x <= element.length / 2; x += 2) {
      const y = Math.sin(x * frequency) * amplitude;
      if (x === -element.length / 2) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  startSimulation() {
    if (this.isSimulating) return;

    this.isSimulating = true;
    this.animate();
  }

  pauseSimulation() {
    this.isSimulating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resetSimulation() {
    this.pauseSimulation();
    // Reset element rotations or positions if needed
    this.elements.forEach((element) => {
      if (element.type === "motor") {
        element.rotation = 0;
      }
    });
    this.draw();
  }

  animate() {
    if (!this.isSimulating) return;

    // Simple animation: rotate motors
    this.elements.forEach((element) => {
      if (element.type === "motor") {
        element.rotation += 2;
        if (element.rotation >= 360) element.rotation = 0;
      }
    });

    this.draw();
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  switchMode(mode) {
    // Update navigation buttons
    document
      .querySelectorAll(".nav-btn")
      .forEach((btn) => btn.classList.remove("active"));
    document.getElementById(`${mode}Btn`).classList.add("active");

    // For this prototype, mode switching is mainly visual
    console.log(`Switched to ${mode} mode`);
  }

  loadSampleGallery() {
    // Create some sample gallery items
    this.gallery = [
      { id: 1, name: "Simple Lever", elements: 3 },
      { id: 2, name: "Gear System", elements: 5 },
      { id: 3, name: "Spring Mechanism", elements: 4 },
    ];
  }

  showGallery() {
    const modal = document.getElementById("galleryModal");
    const grid = document.getElementById("galleryGrid");

    grid.innerHTML = "";

    this.gallery.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "gallery-item";
      itemDiv.innerHTML = `
                <canvas width="180" height="120"></canvas>
                <h4>${item.name}</h4>
                <p>${item.elements} elements</p>
                <button onclick="slidep.loadDesign(${item.id})">Load</button>
            `;
      grid.appendChild(itemDiv);
    });

    modal.classList.remove("hidden");
  }

  hideGallery() {
    document.getElementById("galleryModal").classList.add("hidden");
  }

  loadDesign(id) {
    // Load a sample design
    const designs = {
      1: [
        { type: "bar", x: 200, y: 200, length: 150, rotation: 0 },
        { type: "joint", x: 200, y: 200, length: 0, rotation: 0 },
        { type: "joint", x: 350, y: 200, length: 0, rotation: 0 },
      ],
      2: [
        { type: "motor", x: 300, y: 250, length: 0, rotation: 0 },
        { type: "bar", x: 350, y: 250, length: 80, rotation: 90 },
        { type: "joint", x: 350, y: 250, length: 0, rotation: 0 },
        { type: "bar", x: 350, y: 290, length: 80, rotation: 0 },
        { type: "joint", x: 390, y: 290, length: 0, rotation: 0 },
      ],
      3: [
        { type: "spring", x: 250, y: 200, length: 100, rotation: 0 },
        { type: "bar", x: 300, y: 200, length: 100, rotation: 0 },
        { type: "joint", x: 250, y: 200, length: 0, rotation: 0 },
        { type: "joint", x: 350, y: 200, length: 0, rotation: 0 },
      ],
    };

    this.elements = designs[id].map((el) => ({
      ...el,
      id: Date.now() + Math.random(),
    }));
    this.hideGallery();
    this.draw();
  }
}

// Initialize the prototype
const slidep = new SlidepPrototype();
