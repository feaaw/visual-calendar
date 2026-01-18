import './style.css'

let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

tasks = tasks.map(t => {
  return t;
});

let selectedDate = new Date().toISOString().split('T')[0];
let weekOffset = 0;
let activeColor = '#54a0ff';
let currentMode = 'task';
let editingId = null;
let currentRepeat = 'none';

// Elements
const weekBar = document.getElementById('week-bar');
const taskSidebarList = document.getElementById('task-list');
const habitSidebarList = document.getElementById('habit-list');
const timelineSlots = document.getElementById('timeline-slots');
const timeMarker = document.getElementById('time-marker');
const mainFab = document.getElementById('main-fab');
const fabMenu = document.getElementById('fab-menu');
const creationModal = document.getElementById('creation-modal');
const schedulingSection = document.getElementById('scheduling-section');
const saveBtn = document.getElementById('save-btn');
const titleInput = document.getElementById('title-input');
const notesInput = document.getElementById('notes-input');
const timeInput = document.getElementById('time-input');
const durationInput = document.getElementById('duration-input');

const SLOT_HEIGHT = 120;

function init() {
  updateHeaderContent();
  renderWeekBar();
  renderSidebar();
  renderTimeline();
  updateTimeMarker();
  setInterval(updateTimeMarker, 60000);
  setupInteractions();
  generateRecurringItems();
  lucide.createIcons();
  setTimeout(scrollToWakeUp, 100);
}

function scrollToWakeUp() {
  const wakeUpTask = tasks.find(t => t.date === selectedDate && (t.title.includes('Wake Up') || t.title.includes('起きる')));
  const scroller = document.querySelector('.timeline-scroll-area');
  if (wakeUpTask && wakeUpTask.startTime) {
    const [h, m] = wakeUpTask.startTime.split(':').map(Number);
    const top = (h * SLOT_HEIGHT) + (m / 60 * SLOT_HEIGHT);
    scroller.scrollTo({ top: top - 100, behavior: 'smooth' }); // -100px buffer
  } else {
    // Default to 08:00
    scroller.scrollTo({ top: (8 * SLOT_HEIGHT) - 50, behavior: 'smooth' });
  }
}

function updateHeaderContent() {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const d = new Date();
  d.setDate(d.getDate() + (weekOffset * 7));
  document.getElementById('current-month').textContent = `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function renderWeekBar() {
  weekBar.innerHTML = '';
  const startOfView = new Date();
  startOfView.setDate(startOfView.getDate() + (weekOffset * 7));

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfView);
    date.setDate(startOfView.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

    const dayEl = document.createElement('div');
    dayEl.className = `day-item ${dateStr === selectedDate ? 'active' : ''}`;
    dayEl.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="day-date">${date.getDate()}</span>
        `;
    dayEl.onclick = () => {
      selectedDate = dateStr;
      renderWeekBar();
      generateRecurringItems();
      renderTimeline();
    };
    weekBar.appendChild(dayEl);
  }
}

window.changeWeek = (direction) => {
  weekOffset += direction;
  updateHeaderContent();
  renderWeekBar();
};

function renderSidebar() {
  const tasksPending = tasks.filter(t => t.type === 'task' && !t.startTime && !t.completed);
  const habitsPending = tasks.filter(t => t.type === 'habit' && !t.startTime && !t.completed);

  const renderList = (list, el) => {
    el.innerHTML = list.map(t => `
        <div class="inbox-item" style="border-left-color: ${t.color}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; font-size:16px;">${t.title}</span>
                <div class="task-actions" style="flex-direction:row; gap:10px;">
                   <i data-lucide="edit-2" onclick="openModal('${t.type}', ${t.id})"></i>
                   <i data-lucide="trash-2" onclick="deleteItem(${t.id}, event)"></i>
                </div>
            </div>
        </div>
    `).join('');
    if (list.length === 0) {
      const category = el.id === 'task-list' ? 'Tasks' : 'Habits';
      el.innerHTML = `<p style="opacity:0.3; font-size:14px; font-weight:700; text-align:center; padding: 20px;">No ${category}</p>`;
    }
  };

  renderList(tasksPending, taskSidebarList);
  renderList(habitsPending, habitSidebarList);
  lucide.createIcons();
}

// Overlap Detection & Layout Logic
function renderTimeline() {
  timelineSlots.innerHTML = '';

  // Create 24 slots (00:00 to 23:00)
  for (let i = 0; i < 24; i++) {
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    // Label is positioned via CSS relative to slot (which is at 150px).
    slot.innerHTML = `<span class="time-label">${i.toString().padStart(2, '0')}:00</span>`;
    timelineSlots.appendChild(slot);
  }
  // Terminal 00:00
  const finalSlot = document.createElement('div');
  finalSlot.style.height = '120px';
  finalSlot.style.position = 'relative';
  finalSlot.innerHTML = `<span class="time-label">00:00</span>`;
  timelineSlots.appendChild(finalSlot);

  const dayItems = tasks.filter(t => t.date === selectedDate && t.startTime);

  // Convert times to decimal hours for easier calculation
  const processedItems = dayItems.map(item => {
    const [h, m] = item.startTime.split(':').map(Number);
    const start = h + (m / 60);
    return { ...item, startHour: start, endHour: start + (item.duration / 60) };
  });

  // Detect overlaps and assign columns
  processedItems.sort((a, b) => a.startHour - b.startHour);

  const layout = []; // Array of columns, each containing items
  processedItems.forEach(item => {
    let placed = false;
    for (let i = 0; i < layout.length; i++) {
      const lastInCol = layout[i][layout[i].length - 1];
      if (item.startHour >= lastInCol.endHour) {
        layout[i].push(item);
        placed = true;
        break;
      }
    }
    if (!placed) layout.push([item]);
  });

  const colCount = layout.length;
  layout.forEach((column, colIdx) => {
    column.forEach(item => {
      const top = (item.startHour * SLOT_HEIGHT);
      const height = (item.duration / 60) * SLOT_HEIGHT;
      const width = 100 / colCount;
      const left = colIdx * width;

      const card = document.createElement('div');
      card.className = `task-card ${item.completed ? 'completed' : ''}`;
      card.style.top = `${40 + top}px`;
      card.style.height = `${height}px`;

      // CSS Padding is 150px. Line is at 150px.
      // Align cards to the RIGHT side (near + button).
      const availableWidth = timelineSlots.offsetWidth;
      // Fixed width for cards or %? Let's use flexible but constrained.
      // If we use right positioning:
      const cardWidth = Math.min(300, availableWidth * 0.8); // Max 300px or 80%
      const colWidth = cardWidth + 10;

      // Right align: 0 is rightmost.
      card.style.left = 'auto';
      card.style.right = `${colIdx * colWidth}px`;

      const singleColWidth = 100 / colCount; // % width

      // Position: Right aligned to be near + button
      card.style.left = 'auto';
      card.style.right = `${colIdx * singleColWidth}%`;
      card.style.width = `${singleColWidth - 2}%`;

      card.style.borderLeftColor = item.color || '#54a0ff';
      card.style.color = item.color || '#54a0ff';

      card.innerHTML = `
                <div class="task-title">${item.title}</div>
                <div class="task-time">${item.startTime} • ${item.duration}m ${item.repeat !== 'none' ? '🔄' : ''}</div>
                <div class="task-footer">
                    <div class="task-actions">
                        <i data-lucide="edit-2" onclick="openModal('${item.type}', ${item.id})" style="opacity: 0.2"></i>
                        <i data-lucide="trash-2" onclick="deleteItem(${item.id}, event)" style="opacity: 0.2"></i>
                        <i data-lucide="${item.completed ? 'check-circle' : 'circle'}" 
                           onclick="toggleComplete(${item.id}, event)" 
                           style="color: ${item.color || '#54a0ff'}; ${item.completed ? 'opacity:1' : 'opacity:0.8'}"></i>
                    </div>
                </div>
            `;
      timelineSlots.appendChild(card);
    });
  });
  lucide.createIcons();
}

function generateRecurringItems() {
  const recurringBase = tasks.filter(t => t.repeat && t.repeat !== 'none');
  recurringBase.forEach(base => {
    const alreadyExists = tasks.find(t => t.title === base.title && t.date === selectedDate);
    if (!alreadyExists) {
      let shouldAdd = false;
      const d = new Date(selectedDate);
      const dayOfWeek = d.getDay();

      if (base.repeat === 'daily') shouldAdd = true;
      if (base.repeat === 'weekly' && new Date(base.date).getDay() === dayOfWeek) shouldAdd = true;
      if (base.repeat === 'weekday' && dayOfWeek >= 1 && dayOfWeek <= 5) shouldAdd = true;

      if (shouldAdd) {
        tasks.push({ ...base, id: Date.now() + Math.random(), date: selectedDate, completed: false });
      }
    }
  });
  saveData();
}

window.toggleFabMenu = () => {
  // FAB opens "Add Schedule" (with time)
  openModal('schedule', null, true);
};

window.openModal = (type, id = null) => {
  currentMode = type;
  editingId = id;
  creationModal.style.display = 'flex';
  const modalTitle = document.getElementById('modal-title');
  // Unified title as requested - English
  if (type === 'habit') modalTitle.textContent = 'New Habit';
  else modalTitle.textContent = 'New Task';

  if (id) {
    const item = tasks.find(t => t.id === id);
    titleInput.value = item.title;
    notesInput.value = item.notes || '';

    // Force existing time to start at :00 for Edit Details as requested
    if (item.startTime) {
      const [h, m] = item.startTime.split(':');
      // Always set to :00 even if different
      timeInput.value = `${h}:00`;
    } else {
      timeInput.value = '';
    }

    durationInput.value = item.duration;
    currentRepeat = item.repeat;
    activeColor = item.color;
    schedulingSection.style.display = 'block'; // Always show for edit
  } else {
    titleInput.value = '';
    notesInput.value = '';
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');

    if (type === 'sort_task' || type === 'task') { // Sidebar task
      timeInput.value = '';
      schedulingSection.style.display = 'none'; // No time for simple task
    } else {
      // FAB Schedule or Habit: Default to 00:00 as requested ("00h")
      timeInput.value = `00:00`;
      schedulingSection.style.display = 'block';
    }

    durationInput.value = 30;
    currentRepeat = 'none';
    activeColor = '#54a0ff';
  }

  // Enforce 5 minute steps
  timeInput.step = "300";

  updateChips();
  updateColorDots();
  saveBtn.onclick = handleSave;

  mainFab.classList.remove('open');
  fabMenu.classList.remove('open');
};

window.closeModal = () => { creationModal.style.display = 'none'; };

function handleSave() {
  const title = titleInput.value;
  const notes = notesInput.value;
  const time = timeInput.value;
  const dur = parseInt(durationInput.value);

  if (!title) return;

  if (editingId) {
    const idx = tasks.findIndex(t => t.id === editingId);
    tasks[idx] = { ...tasks[idx], title, notes, startTime: time, duration: dur, repeat: currentRepeat, color: activeColor };
  } else {
    tasks.push({
      id: Date.now(),
      title,
      notes,
      startTime: time,
      duration: dur,
      completed: false,
      date: selectedDate,
      type: currentMode,
      repeat: currentRepeat,
      color: activeColor
    });
  };

  saveData(); // Auto-save on create/edit
  renderTimeline();
  renderSidebar();
  closeModal();
}

window.toggleComplete = (id, e) => {
  e.stopPropagation();
  const item = tasks.find(t => t.id === id);
  if (item) item.completed = !item.completed;
  saveData();
  renderTimeline();
};

window.deleteItem = (id, e) => {
  e.stopPropagation();
  tasks = tasks.filter(t => t.id !== id);
  saveData();
  renderTimeline();
  renderSidebar();
};

function setupInteractions() {
  document.querySelectorAll('.color-circle').forEach(dot => {
    dot.onclick = () => {
      activeColor = dot.dataset.color;
      updateColorDots();
    };
  });

  document.querySelectorAll('.chip-modern').forEach(chip => {
    chip.onclick = () => {
      currentRepeat = chip.dataset.repeat;
      updateChips();
    };
  });
}

function updateColorDots() {
  document.querySelectorAll('.color-circle').forEach(d => {
    d.classList.toggle('active', d.dataset.color === activeColor);
  });
}

function updateChips() {
  document.querySelectorAll('.chip-modern').forEach(c => {
    c.classList.toggle('active', c.dataset.repeat === currentRepeat);
  });
}

function updateTimeMarker() {
  const now = new Date();
  if (now.toISOString().split('T')[0] === selectedDate) {
    timeMarker.style.display = 'block';
    const h = now.getHours();
    const m = now.getMinutes();
    // Add the top offset of 40px used in .timeline-container
    const top = 40 + (h * SLOT_HEIGHT) + (m / 60 * SLOT_HEIGHT);
    timeMarker.style.top = `${top}px`;
  } else {
    timeMarker.style.display = 'none';
  }
}

const settingsModal = document.getElementById('settings-modal');
window.openSettings = () => { settingsModal.style.display = 'flex'; };
window.closeSettings = () => { settingsModal.style.display = 'none'; };

window.setTheme = (themeName) => {
  document.body.className = `theme-${themeName}`;
  // Save theme preference logic can go here
  localStorage.setItem('theme', themeName);
};

// Force Blue Theme
const savedTheme = localStorage.getItem('theme');
const validThemes = ['blue', 'white', 'black'];
if (!validThemes.includes(savedTheme)) {
  document.body.className = 'theme-blue';
  localStorage.setItem('theme', 'blue');
} else {
  document.body.className = `theme-${savedTheme}`;
}

function saveData() { localStorage.setItem('tasks', JSON.stringify(tasks)); }

init();
