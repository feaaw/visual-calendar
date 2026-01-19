import './style.css'

// ============================================
// Data Management
// ============================================
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let inbox = JSON.parse(localStorage.getItem('inbox')) || [];
let projects = JSON.parse(localStorage.getItem('projects')) || [];

// ============================================
// State
// ============================================
let selectedDate = new Date().toISOString().split('T')[0];
let weekOffset = 0;
let activeColor = '#54a0ff';
let activeIcon = 'circle';
let currentMode = 'task';
let editingId = null;
let currentRepeat = 'none';
let currentReminder = 'none';

// Settings
let settings = JSON.parse(localStorage.getItem('settings')) || {
  notifyTaskStart: true,
  notifyMissedTasks: true,
  autoReschedule: true,
  notificationFrequency: 'realtime'
};

// Timer State
let timerState = {
  isRunning: false,
  isPaused: false,
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  interval: null
};

// Voice Recognition
let recognition = null;
let isListening = false;

// ============================================
// DOM Elements
// ============================================
const weekBar = document.getElementById('week-bar');
const taskSidebarList = document.getElementById('task-list');
const habitSidebarList = document.getElementById('habit-list');
const inboxList = document.getElementById('inbox-list');
const projectList = document.getElementById('project-list');
const timelineSlots = document.getElementById('timeline-slots');
const timeMarker = document.getElementById('time-marker');
const mainFab = document.getElementById('main-fab');
const fabMenu = document.getElementById('fab-menu');
const creationModal = document.getElementById('creation-modal');
const schedulingSection = document.getElementById('scheduling-section');
const projectSection = document.getElementById('project-section');
const saveBtn = document.getElementById('save-btn');
const titleInput = document.getElementById('title-input');
const notesInput = document.getElementById('notes-input');
const timeInput = document.getElementById('time-input');
const dateInput = document.getElementById('date-input');
const durationInput = document.getElementById('duration-input');
const timerWidget = document.getElementById('timer-widget');
const voiceModal = document.getElementById('voice-modal');
const settingsModal = document.getElementById('settings-modal');

const SLOT_HEIGHT = 120;

// ============================================
// Initialization
// ============================================
function init() {
  updateHeaderContent();
  renderWeekBar();
  renderSidebar();
  renderTimeline();
  updateTimeMarker();
  setInterval(updateTimeMarker, 60000);
  setupInteractions();
  generateRecurringItems();
  checkMissedTasks();
  setInterval(checkMissedTasks, 60000); // Check every minute
  lucide.createIcons();
  setTimeout(scrollToWakeUp, 100);

  // Set date input to selected date
  dateInput.value = selectedDate;

  // Initialize Web Speech API if available
  initVoiceRecognition();

  // Load settings
  loadSettings();
}

function scrollToWakeUp() {
  const wakeUpTask = tasks.find(t => t.date === selectedDate && (t.title.includes('Wake Up') || t.title.includes('起きる')));
  const scroller = document.querySelector('.timeline-scroll-area');
  if (wakeUpTask && wakeUpTask.startTime) {
    const [h, m] = wakeUpTask.startTime.split(':').map(Number);
    const top = (h * SLOT_HEIGHT) + (m / 60 * SLOT_HEIGHT);
    scroller.scrollTo({ top: top - 100, behavior: 'smooth' });
  } else {
    scroller.scrollTo({ top: (8 * SLOT_HEIGHT) - 50, behavior: 'smooth' });
  }
}

function updateHeaderContent() {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const d = new Date();
  d.setDate(d.getDate() + (weekOffset * 7));
  document.getElementById('current-month').textContent = `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ============================================
// Week Bar Rendering
// ============================================
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
      dateInput.value = selectedDate;
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

// ============================================
// Sidebar Rendering
// ============================================
function renderSidebar() {
  // Inbox
  if (inboxList) {
    if (inbox.length === 0) {
      inboxList.innerHTML = `<p style="opacity:0.3; font-size:14px; font-weight:700; text-align:center; padding: 20px;">空</p>`;
    } else {
      inboxList.innerHTML = inbox.map((item, idx) => `
        <div class="inbox-item" style="border-left-color: #54a0ff">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:800; font-size:16px;">${item.text}</span>
            <div class="task-actions" style="flex-direction:row; gap:10px;">
              <i data-lucide="arrow-right" onclick="organizeInboxItem(${idx})" title="整理"></i>
              <i data-lucide="trash-2" onclick="deleteInboxItem(${idx})"></i>
            </div>
          </div>
          ${item.timestamp ? `<div style="opacity:0.5; font-size:12px; margin-top:4px;">${new Date(item.timestamp).toLocaleString('ja-JP')}</div>` : ''}
        </div>
      `).join('');
    }
  }

  // Tasks
  const tasksPending = tasks.filter(t => t.type === 'task' && !t.startTime && !t.completed);
  renderTaskList(tasksPending, taskSidebarList, 'タスク');

  // Projects
  const projectItems = tasks.filter(t => t.type === 'project');
  renderProjectList(projectItems, projectList);

  // Habits
  const habitsPending = tasks.filter(t => t.type === 'habit' && !t.completed);
  renderTaskList(habitsPending, habitSidebarList, 'ルーチン');

  lucide.createIcons();
}

function renderTaskList(list, el, category) {
  if (!el) return;

  el.innerHTML = list.map(t => `
    <div class="inbox-item" style="border-left-color: ${t.color}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:8px;">
          <i data-lucide="${t.icon || 'circle'}" style="width:16px; height:16px; color:${t.color}"></i>
          <span style="font-weight:800; font-size:16px;">${t.title}</span>
        </div>
        <div class="task-actions" style="flex-direction:row; gap:10px;">
          <i data-lucide="edit-2" onclick="openModal('${t.type}', ${t.id})"></i>
          <i data-lucide="trash-2" onclick="deleteItem(${t.id}, event)"></i>
        </div>
      </div>
    </div>
  `).join('');

  if (list.length === 0) {
    el.innerHTML = `<p style="opacity:0.3; font-size:14px; font-weight:700; text-align:center; padding: 20px;">空</p>`;
  }
}

function renderProjectList(list, el) {
  if (!el) return;

  el.innerHTML = list.map(proj => {
    const subtasks = proj.subtasks || [];
    const completedCount = subtasks.filter(st => st.completed).length;
    const totalCount = subtasks.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return `
      <div class="inbox-item project-item" style="border-left-color: ${proj.color}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <i data-lucide="${proj.icon || 'folder'}" style="width:16px; height:16px; color:${proj.color}"></i>
              <span style="font-weight:800; font-size:16px;">${proj.title}</span>
            </div>
            ${totalCount > 0 ? `
              <div style="font-size:12px; opacity:0.7; margin-bottom:4px;">${completedCount}/${totalCount} 完了</div>
              <div class="progress-bar">
                <div class="progress-fill" style="width:${progress}%; background:${proj.color}"></div>
              </div>
            ` : ''}
          </div>
          <div class="task-actions" style="flex-direction:row; gap:10px;">
            <i data-lucide="edit-2" onclick="openModal('project', ${proj.id})"></i>
            <i data-lucide="trash-2" onclick="deleteItem(${proj.id}, event)"></i>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (list.length === 0) {
    el.innerHTML = `<p style="opacity:0.3; font-size:14px; font-weight:700; text-align:center; padding: 20px;">空</p>`;
  }
}

// ============================================
// Timeline Rendering
// ============================================
function renderTimeline() {
  timelineSlots.innerHTML = '';

  // Create 24 slots (00:00 to 23:00)
  for (let i = 0; i < 24; i++) {
    const slot = document.createElement('div');
    slot.className = 'time-slot';
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

  // Convert times to decimal hours
  const processedItems = dayItems.map(item => {
    const [h, m] = item.startTime.split(':').map(Number);
    const start = h + (m / 60);
    return { ...item, startHour: start, endHour: start + (item.duration / 60) };
  });

  // Detect overlaps and assign columns
  processedItems.sort((a, b) => a.startHour - b.startHour);

  const layout = [];
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
      const singleColWidth = 100 / colCount;

      const card = document.createElement('div');
      card.className = `task-card ${item.completed ? 'completed' : ''}`;
      card.style.top = `${40 + top}px`;
      card.style.height = `${height}px`;
      card.style.left = 'auto';
      card.style.right = `${colIdx * singleColWidth}%`;
      card.style.width = `${singleColWidth - 2}%`;
      card.style.borderLeftColor = item.color || '#54a0ff';
      card.style.color = item.color || '#54a0ff';

      const subtaskInfo = item.type === 'project' && item.subtasks ?
        `<div style="font-size:11px; opacity:0.6;">${item.subtasks.filter(st => st.completed).length}/${item.subtasks.length} サブタスク</div>` : '';

      card.innerHTML = `
        <div class="task-title">
          <i data-lucide="${item.icon || 'circle'}" style="width:14px; height:14px; margin-right:4px;"></i>
          ${item.title}
        </div>
        <div class="task-time">${item.startTime} • ${item.duration}m ${item.repeat !== 'none' ? '🔄' : ''}${item.reminder !== 'none' ? '🔔' : ''}</div>
        ${subtaskInfo}
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

// ============================================
// Recurring Tasks
// ============================================
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

// ============================================
// Missed Tasks & Auto-Reschedule
// ============================================
function checkMissedTasks() {
  if (!settings.autoReschedule) return;

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentTime = now.getHours() * 60 + now.getMinutes();

  tasks.forEach(task => {
    if (task.date < today && !task.completed && task.startTime) {
      // Missed task - reschedule to tomorrow
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      task.date = tomorrow.toISOString().split('T')[0];
      task.rescheduled = true;

      if (settings.notifyMissedTasks) {
        showNotification('逃したタスク', `「${task.title}」を明日に再計画しました`);
      }
    }
  });

  saveData();
}

// ============================================
// Notifications
// ============================================
function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/javascript.svg' });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '/javascript.svg' });
      }
    });
  }
}

// ============================================
// Modal Management
// ============================================
window.toggleFabMenu = () => {
  mainFab.classList.toggle('open');
  fabMenu.classList.toggle('open');
};

window.openModal = (type, id = null) => {
  currentMode = type;
  editingId = id;
  creationModal.style.display = 'flex';
  const modalTitle = document.getElementById('modal-title');

  // Show/hide project section based on type
  if (type === 'project') {
    modalTitle.textContent = id ? 'Edit Project' : 'New Project';
    projectSection.style.display = 'block';
  } else {
    if (type === 'habit') modalTitle.textContent = 'New Habit';
    else modalTitle.textContent = 'New Task';
    projectSection.style.display = 'none';
  }

  if (id) {
    const item = tasks.find(t => t.id === id);
    titleInput.value = item.title;
    notesInput.value = item.notes || '';
    dateInput.value = item.date || selectedDate;

    if (item.startTime) {
      timeInput.value = item.startTime;
    } else {
      timeInput.value = '';
    }

    durationInput.value = item.duration;
    currentRepeat = item.repeat || 'none';
    currentReminder = item.reminder || 'none';
    activeColor = item.color || '#54a0ff';
    activeIcon = item.icon || 'circle';
    schedulingSection.style.display = 'block';

    // Render subtasks if project
    if (item.type === 'project') {
      renderSubtaskEditor(item.subtasks || []);
    }
  } else {
    titleInput.value = '';
    notesInput.value = '';
    dateInput.value = selectedDate;

    if (type === 'task') {
      timeInput.value = '';
      schedulingSection.style.display = 'none';
    } else {
      timeInput.value = '08:00';
      schedulingSection.style.display = 'block';
    }

    durationInput.value = 30;
    currentRepeat = 'none';
    currentReminder = 'none';
    activeColor = '#54a0ff';
    activeIcon = 'circle';

    if (type === 'project') {
      renderSubtaskEditor([]);
    }
  }

  updateChips();
  updateColorDots();
  updateIconPalette();
  saveBtn.onclick = handleSave;

  closeFabMenu();
};

function closeFabMenu() {
  mainFab.classList.remove('open');
  fabMenu.classList.remove('open');
}

window.closeModal = () => {
  creationModal.style.display = 'none';
};

// ============================================
// Subtask Management
// ============================================
function renderSubtaskEditor(subtasks) {
  const subtaskList = document.getElementById('subtask-list');
  subtaskList.innerHTML = subtasks.map((st, idx) => `
    <div class="subtask-item" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:8px; background:rgba(255,255,255,0.05); border-radius:8px;">
      <input type="checkbox" ${st.completed ? 'checked' : ''} onchange="toggleSubtaskInEditor(${idx})">
      <input type="text" value="${st.title}" class="premium-input-modern" style="flex:1; padding:8px;" onchange="updateSubtaskTitle(${idx}, this.value)">
      <i data-lucide="trash-2" onclick="removeSubtask(${idx})" style="cursor:pointer;"></i>
    </div>
  `).join('');
  lucide.createIcons();
}

window.addSubtask = () => {
  const subtaskList = document.getElementById('subtask-list');
  const newSubtask = { title: '新しいサブタスク', completed: false };

  const item = editingId ? tasks.find(t => t.id === editingId) : null;
  const currentSubtasks = item?.subtasks || [];
  currentSubtasks.push(newSubtask);

  renderSubtaskEditor(currentSubtasks);
};

window.toggleSubtaskInEditor = (idx) => {
  const item = editingId ? tasks.find(t => t.id === editingId) : null;
  if (item && item.subtasks) {
    item.subtasks[idx].completed = !item.subtasks[idx].completed;
  }
};

window.updateSubtaskTitle = (idx, title) => {
  const item = editingId ? tasks.find(t => t.id === editingId) : null;
  if (item && item.subtasks) {
    item.subtasks[idx].title = title;
  }
};

window.removeSubtask = (idx) => {
  const item = editingId ? tasks.find(t => t.id === editingId) : null;
  if (item && item.subtasks) {
    item.subtasks.splice(idx, 1);
    renderSubtaskEditor(item.subtasks);
  }
};

// ============================================
// Save Handler
// ============================================
function handleSave() {
  const title = titleInput.value;
  const notes = notesInput.value;
  const time = timeInput.value;
  const date = dateInput.value;
  const dur = parseInt(durationInput.value);

  if (!title) return;

  // Collect subtasks if project mode
  let subtasks = [];
  if (currentMode === 'project') {
    const subtaskInputs = document.querySelectorAll('#subtask-list .subtask-item input[type="text"]');
    const subtaskChecks = document.querySelectorAll('#subtask-list .subtask-item input[type="checkbox"]');
    subtasks = Array.from(subtaskInputs).map((input, idx) => ({
      title: input.value,
      completed: subtaskChecks[idx]?.checked || false
    }));
  }

  if (editingId) {
    const idx = tasks.findIndex(t => t.id === editingId);
    tasks[idx] = {
      ...tasks[idx],
      title,
      notes,
      date,
      startTime: time,
      duration: dur,
      repeat: currentRepeat,
      reminder: currentReminder,
      color: activeColor,
      icon: activeIcon,
      subtasks: currentMode === 'project' ? subtasks : tasks[idx].subtasks
    };
  } else {
    tasks.push({
      id: Date.now(),
      title,
      notes,
      date,
      startTime: time,
      duration: dur,
      completed: false,
      type: currentMode,
      repeat: currentRepeat,
      reminder: currentReminder,
      color: activeColor,
      icon: activeIcon,
      subtasks: currentMode === 'project' ? subtasks : undefined
    });
  }

  saveData();
  renderTimeline();
  renderSidebar();
  closeModal();
}

// ============================================
// Task Actions
// ============================================
window.toggleComplete = (id, e) => {
  e.stopPropagation();
  const item = tasks.find(t => t.id === id);
  if (item) {
    item.completed = !item.completed;

    if (item.completed && settings.notifyTaskStart) {
      showNotification('タスク完了', `「${item.title}」を完了しました！`);
    }
  }
  saveData();
  renderTimeline();
  renderSidebar();
};

window.deleteItem = (id, e) => {
  e?.stopPropagation();
  tasks = tasks.filter(t => t.id !== id);
  saveData();
  renderTimeline();
  renderSidebar();
};

// ============================================
// Inbox Management
// ============================================
window.addInboxNote = () => {
  const text = prompt('クイックメモを入力:');
  if (text) {
    inbox.push({
      text,
      timestamp: Date.now()
    });
    saveInbox();
    renderSidebar();
  }
};

window.organizeInboxItem = (idx) => {
  const item = inbox[idx];
  titleInput.value = item.text;
  inbox.splice(idx, 1);
  saveInbox();
  renderSidebar();
  openModal('task');
};

window.deleteInboxItem = (idx) => {
  inbox.splice(idx, 1);
  saveInbox();
  renderSidebar();
};

function saveInbox() {
  localStorage.setItem('inbox', JSON.stringify(inbox));
}

// ============================================
// UI Interactions
// ============================================
function setupInteractions() {
  document.querySelectorAll('.color-circle').forEach(dot => {
    dot.onclick = () => {
      activeColor = dot.dataset.color;
      updateColorDots();
    };
  });

  document.querySelectorAll('[data-repeat]').forEach(chip => {
    chip.onclick = () => {
      currentRepeat = chip.dataset.repeat;
      updateChips();
    };
  });

  document.querySelectorAll('[data-reminder]').forEach(chip => {
    chip.onclick = () => {
      currentReminder = chip.dataset.reminder;
      updateReminderChips();
    };
  });

  document.querySelectorAll('.icon-btn').forEach(btn => {
    btn.onclick = () => {
      activeIcon = btn.dataset.icon;
      updateIconPalette();
    };
  });
}

function updateColorDots() {
  document.querySelectorAll('.color-circle').forEach(d => {
    d.classList.toggle('active', d.dataset.color === activeColor);
  });
}

function updateChips() {
  document.querySelectorAll('[data-repeat]').forEach(c => {
    c.classList.toggle('active', c.dataset.repeat === currentRepeat);
  });
}

function updateReminderChips() {
  document.querySelectorAll('[data-reminder]').forEach(c => {
    c.classList.toggle('active', c.dataset.reminder === currentReminder);
  });
}

function updateIconPalette() {
  document.querySelectorAll('.icon-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.icon === activeIcon);
  });
}

// ============================================
// Time Marker
// ============================================
function updateTimeMarker() {
  const now = new Date();
  if (now.toISOString().split('T')[0] === selectedDate) {
    timeMarker.style.display = 'block';
    const h = now.getHours();
    const m = now.getMinutes();
    const top = 40 + (h * SLOT_HEIGHT) + (m / 60 * SLOT_HEIGHT);
    timeMarker.style.top = `${top}px`;
  } else {
    timeMarker.style.display = 'none';
  }
}

// ============================================
// Focus Timer
// ============================================
window.toggleTimer = () => {
  timerWidget.classList.toggle('show');
};

window.startTimer = () => {
  if (timerState.isRunning) return;

  timerState.isRunning = true;
  timerState.isPaused = false;

  document.getElementById('timer-start-btn').style.display = 'none';
  document.getElementById('timer-pause-btn').style.display = 'inline-flex';

  timerState.interval = setInterval(() => {
    if (timerState.remainingSeconds > 0) {
      timerState.remainingSeconds--;
      updateTimerDisplay();
    } else {
      // Timer finished
      timerComplete();
    }
  }, 1000);
};

window.pauseTimer = () => {
  if (!timerState.isRunning) return;

  timerState.isRunning = false;
  timerState.isPaused = true;

  clearInterval(timerState.interval);

  document.getElementById('timer-start-btn').style.display = 'inline-flex';
  document.getElementById('timer-pause-btn').style.display = 'none';
};

window.resetTimer = () => {
  pauseTimer();
  timerState.remainingSeconds = timerState.totalSeconds;
  timerState.isPaused = false;
  updateTimerDisplay();
};

window.setTimerPreset = (minutes) => {
  resetTimer();
  timerState.totalSeconds = minutes * 60;
  timerState.remainingSeconds = minutes * 60;
  updateTimerDisplay();

  // Update active preset button
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.minutes) === minutes);
  });

  // Update label
  const label = minutes > 20 ? '集中時間' : '休憩時間';
  document.getElementById('timer-label').textContent = label;
};

function updateTimerDisplay() {
  const minutes = Math.floor(timerState.remainingSeconds / 60);
  const seconds = timerState.remainingSeconds % 60;
  document.getElementById('timer-time').textContent =
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Update circular progress
  const progress = document.getElementById('timer-progress');
  const circumference = 2 * Math.PI * 90; // radius is 90
  const offset = circumference * (1 - (timerState.remainingSeconds / timerState.totalSeconds));
  progress.style.strokeDashoffset = offset;
}

function timerComplete() {
  pauseTimer();
  showNotification('タイマー完了', 'フォーカス時間が終了しました！');

  // Play a sound (optional)
  if (typeof Audio !== 'undefined') {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihURELTKXh8bllHAU2kNbx0n4qBSh+zPLaizsKFFm16+mjUxMMSZ7f8sFuJAUuhM/y2Ik1CBhkvOzooVERDEyl4PG5ZRwFN5DW8dJ+KgYrhM7y2Ys4CRpcturqpVMTDEud3/HBbiQGLoPP8tuKNwgXZLzs6KFPFA1NpODxuWcdBjiP1vHSfykGKoTP8tuJOAgaXLbq6qVUEgtKnN/xwW4lBS+Cz/LZizgJG121' + String.fromCharCode(54) + 'OinUxQMS5vf8cJuKgU3kdbx0n4qBiuEz/LbizcKGlu16+qmVRMMTJzf8cFtJQYugM/y24o4CRhcterqpVQSC0qc3/HCbSUIL4LQ8tmLOAkaXLbq6qZUEwtKnN/xwW4lBi+Dz/LcizgKGly26uqmVRQMTJzf8cJtJggwgM/y24o4CBlcterqpVUTC0qb3/HCbSYJL4LQ8tmLOAoaXLXq6qZVFAxMnN/xwm0mCDCAz/LbijgKGly16uqmVRULTJzf8cJtJggvgc/y24s5ChtcterqpVYUDEub3/HCbSYJMIPP8tuLOQobXLXr6qZWFQxLm9/xwm0mCTCCz/LbizgKG1y06uqmVhUMS5vf8cJtJgkwgs/y24s6ChtbtOvqpl' + String.fromCharCode(89) + 'VBNMm9/xwm0mCTCCz/LbizgKG1y06+qmVRUMTJvf8cJtJggwgs/y24s4CxtcterqpVYUDEua3/HCbScJMILP8tuKOQsbW7Xr6qZWFQ1Lmt/xwm0mCTCC0PLbizgLG1u1' + String.fromCharCode(54) + 'OmlVxYNS5rf8cJtJwkwgs/y3Io5CxtbtevqpVYWDUua3/HDbScJMYLP8tuKOQsbW7Xr6qVWFg1Lmt/xw20nCTGCz/LbijkLG1u06+qlVRYNS5rf8cNtJwkxgs/y24o5CxtbterqpVUWDUua3/HDbScJMYLP8tuLOgscXLTq6qZWFg1Lmt/xw20oCTGBz/LbizgLHFy06uqmVhYNS5rf8cNtKAkxgc/y24s6CxxcterqpVYWDUqb3/HDbSgKMYHA==');
    audio.play().catch(() => { });
  }

  resetTimer();
}

// ============================================
// Voice Recognition
// ============================================
function initVoiceRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      document.getElementById('voice-transcript').textContent = transcript;

      if (event.results[event.results.length - 1].isFinal) {
        processVoiceCommand(transcript);
      }
    };

    recognition.onend = () => {
      isListening = false;
      document.getElementById('voice-pulse').classList.remove('active');
      document.getElementById('voice-btn').innerHTML = '<i data-lucide="mic"></i> 音声認識を開始';
      lucide.createIcons();
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      isListening = false;
      document.getElementById('voice-pulse').classList.remove('active');
    };
  }
}

window.openVoiceInput = () => {
  if (!recognition) {
    alert('お使いのブラウザは音声認識に対応していません。Chrome、Edge、Safariをお試しください。');
    return;
  }
  voiceModal.style.display = 'flex';
  document.getElementById('voice-transcript').textContent = '';
};

window.closeVoiceInput = () => {
  if (isListening) {
    recognition.stop();
  }
  voiceModal.style.display = 'none';
};

window.toggleVoiceRecognition = () => {
  if (!recognition) return;

  if (isListening) {
    recognition.stop();
    isListening = false;
  } else {
    recognition.start();
    isListening = true;
    document.getElementById('voice-pulse').classList.add('active');
    document.getElementById('voice-btn').innerHTML = '<i data-lucide="mic-off"></i> 停止';
    lucide.createIcons();
  }
};

function processVoiceCommand(text) {
  // AI Natural Language Processing (simplified version)
  // Detects date/time patterns and creates tasks

  let title = text;
  let detectedDate = selectedDate;
  let detectedTime = '08:00';
  let duration = 30;

  // Date detection
  if (text.includes('明日')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    detectedDate = tomorrow.toISOString().split('T')[0];
    title = text.replace('明日', '').trim();
  } else if (text.includes('今日')) {
    detectedDate = new Date().toISOString().split('T')[0];
    title = text.replace('今日', '').trim();
  }

  // Time detection (午前/午後 + 数字 + 時)
  const timeMatch = text.match(/(午前|午後)?(\d{1,2})(時)?/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[2]);
    if (timeMatch[1] === '午後' && hour < 12) {
      hour += 12;
    }
    detectedTime = `${hour.toString().padStart(2, '0')}:00`;
    title = text.replace(timeMatch[0], '').trim();
  }

  // Duration detection
  if (text.includes('1時間')) {
    duration = 60;
    title = title.replace('1時間', '').trim();
  } else if (text.includes('2時間')) {
    duration = 120;
    title = title.replace('2時間', '').trim();
  }

  // Clean up title
  title = title.replace(/の?、/g, ' ').replace(/に/g, ' ').trim();

  if (title) {
    tasks.push({
      id: Date.now(),
      title,
      notes: `音声入力: "${text}"`,
      date: detectedDate,
      startTime: detectedTime,
      duration,
      completed: false,
      type: 'task',
      repeat: 'none',
      reminder: 'none',
      color: '#54a0ff',
      icon: 'mic'
    });

    saveData();
    renderTimeline();
    renderSidebar();

    showNotification('タスク作成', `「${title}」を追加しました`);
    closeVoiceInput();
  }
}

// ============================================
// Settings
// ============================================
window.openSettings = () => {
  settingsModal.style.display = 'flex';
  loadSettings();
};

window.closeSettings = () => {
  saveSettings();
  settingsModal.style.display = 'none';
};

function loadSettings() {
  document.getElementById('notify-task-start').checked = settings.notifyTaskStart;
  document.getElementById('notify-missed-tasks').checked = settings.notifyMissedTasks;
  document.getElementById('auto-reschedule').checked = settings.autoReschedule;
  document.getElementById('notification-frequency').value = settings.notificationFrequency;
}

function saveSettings() {
  settings.notifyTaskStart = document.getElementById('notify-task-start').checked;
  settings.notifyMissedTasks = document.getElementById('notify-missed-tasks').checked;
  settings.autoReschedule = document.getElementById('auto-reschedule').checked;
  settings.notificationFrequency = document.getElementById('notification-frequency').value;

  localStorage.setItem('settings', JSON.stringify(settings));
}

// ============================================
// Data Import/Export
// ============================================
window.exportData = () => {
  const data = {
    tasks,
    inbox,
    settings,
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bluecal-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification('エクスポート完了', 'データをダウンロードしました');
};

window.importData = () => {
  document.getElementById('import-file').click();
};

window.handleImport = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (confirm('現在のデータは上書きされます。続行しますか？')) {
        if (data.tasks) tasks = data.tasks;
        if (data.inbox) inbox = data.inbox;
        if (data.settings) settings = data.settings;

        saveData();
        saveInbox();
        localStorage.setItem('settings', JSON.stringify(settings));

        init();
        showNotification('インポート完了', 'データを復元しました');
      }
    } catch (err) {
      alert('ファイルの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
};

// ============================================
// Data Persistence
// ============================================
function saveData() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

// ============================================
// Sidebar Toggle for Tablets/Mobile
// ============================================
window.toggleSidebar = () => {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
};

// ============================================
// App Initialization
// ============================================
init();
