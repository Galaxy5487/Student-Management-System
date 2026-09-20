const DB_KEY = 'sms_students_indexed_v3';
let students = [];
let editingId = null;
let viewingId = null;
let pendingDeleteId = null;
let currentSort = { field: 'created_at', dir: 'desc' };
let filters = { search: '', gender: 'all', course: 'all' };

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
function formatDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}
function generateAdmissionNumber(){
  const collegeCode = 'MHIS';
  const year = new Date().getFullYear();
  const currentYearStudents = students.filter(s => {
    const m = String(s.student_id || '').match(/^MHIS-(\d{4})(\d{3})$/i);
    return m && Number(m[1]) === year;
  });

  let highestRoll = 0;
  currentYearStudents.forEach(s => {
    const m = String(s.student_id || '').match(/^MHIS-(\d{4})(\d{3})$/i);
    if (m) highestRoll = Math.max(highestRoll, Number(m[2]));
  });

  const nextRoll = String(highestRoll + 1).padStart(3, '0');
  return `${collegeCode}-${year}${nextRoll}`;
}
function formatDOB(v){
  if(!v) return '—';
  const d = new Date(v);
  if(isNaN(d)) return v;
  return d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
}
function calcAge(dob){
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear()-d.getFullYear();
  const m = now.getMonth()-d.getMonth();
  if(m<0||(m===0 && now.getDate()<d.getDate())) a--;
  return a>=0? a+' years':'—';
}
function initials(name){
  return name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function loadFromStorage(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return null;
    return parsed;
  }catch(e){ return null; }
}
function saveToStorage(){
  try{
    localStorage.setItem(DB_KEY, JSON.stringify(students));
    return true;
  }catch(e){
    showToast('Storage full — could not save to database','error');
    return false;
  }
}

async function loadStudents(){
  const dashLoading = document.getElementById('dashLoading');
  const tableLoading = document.getElementById('tableLoading');
  const errEl = document.getElementById('dbError');
  errEl.classList.add('hidden');
  dashLoading.classList.remove('hidden');
  tableLoading.classList.remove('hidden');
  await delay(420);
  try{
    const data = loadFromStorage();
    const demoNames = ['Aisha Johnson','David Chen','Sofia Martinez','James Wilson','Priya Patel'];
    const isDemoData = Array.isArray(data) && data.some(s => demoNames.includes(s.full_name));

    if(isDemoData){
      localStorage.setItem(DB_KEY, JSON.stringify([]));
      students = [];
    } else {
      students = Array.isArray(data) ? data : [];
      if(!Array.isArray(data)) localStorage.setItem(DB_KEY, JSON.stringify([]));
    }
    renderAll();
  }catch(e){
    errEl.classList.remove('hidden');
    showToast('Database error loading records','error');
  }finally{
    dashLoading.classList.add('hidden');
    tableLoading.classList.add('hidden');
  }
}

function getFilteredSorted(){
  let out = [...students];
  const q = filters.search.trim().toLowerCase();
  if(q){
    out = out.filter(s =>
      s.student_id.toLowerCase().includes(q) ||
      s.full_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.course.toLowerCase().includes(q)
    );
  }
  if(filters.gender!=='all') out = out.filter(s=>s.gender===filters.gender);
  if(filters.course!=='all') out = out.filter(s=>s.course===filters.course);
  out.sort((a,b)=>{
    let av = a[currentSort.field];
    let bv = b[currentSort.field];
    if(currentSort.field==='created_at' || currentSort.field==='updated_at'){
      av = new Date(av).getTime(); bv = new Date(bv).getTime();
    } else {
      av = String(av||'').toLowerCase(); bv = String(bv||'').toLowerCase();
    }
    if(av<bv) return currentSort.dir==='asc'? -1:1;
    if(av>bv) return currentSort.dir==='asc'? 1:-1;
    return 0;
  });
  return out;
}

function renderAll(){
  renderStats();
  renderRecent();
  renderCourseChips();
  renderCourseFilterOptions();
  renderStudentsTable();
  const settingsCount = document.getElementById('settingsCount');
  if (settingsCount) settingsCount.textContent = students.length;
}

function renderStats(){
  const total = students.length;
  const male = students.filter(s=>s.gender==='Male').length;
  const female = students.filter(s=>s.gender==='Female').length;
  const other = students.filter(s=>s.gender==='Other').length;
  const courses = new Set(students.map(s=>s.course)).size;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statMale').textContent = male;
  document.getElementById('statFemale').textContent = female;
  document.getElementById('statCourses').textContent = courses;
  document.getElementById('statMalePct').textContent = total? Math.round(male/total*100)+'% of total':'—';
  document.getElementById('statFemalePct').textContent = total? Math.round(female/total*100)+'% of total':'—';
  document.getElementById('distMale').textContent = male;
  document.getElementById('distFemale').textContent = female;
  document.getElementById('distOther').textContent = other;
  document.getElementById('barMale').style.width = total? (male/total*100)+'%':'0';
  document.getElementById('barFemale').style.width = total? (female/total*100)+'%':'0';
  document.getElementById('barOther').style.width = total? (other/total*100)+'%':'0';
  const showOther = other>0;
  document.getElementById('otherRow').style.display = showOther? 'flex':'none';
  document.getElementById('legendOther').style.display = showOther? 'inline-flex':'none';
}

function renderRecent(){
  const tbody = document.getElementById('recentBody');
  const empty = document.getElementById('recentEmpty');
  const sorted = [...students].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,4);
  if(sorted.length===0){
    tbody.innerHTML='';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = sorted.map(s=>`
    <tr>
      <td>
        <div class="cell-main">
          <div class="avatar">${escapeHtml(initials(s.full_name))}</div>
          <div>
            <strong>${escapeHtml(s.full_name)}</strong>
            <span>${escapeHtml(s.student_id)}</span>
          </div>
        </div>
      </td>
      <td><span class="pill course-pill">${escapeHtml(s.course)}</span></td>
      <td style="color:var(--muted);font-size:12px">${formatDate(s.created_at)}</td>
    </tr>
  `).join('');
}

function renderCourseChips(){
  const wrap = document.getElementById('courseChips');
  const counts = {};
  students.forEach(s=> counts[s.course]=(counts[s.course]||0)+1);
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(entries.length===0){
    wrap.innerHTML = '<span style="color:var(--muted);font-size:13px">No courses yet.</span>';
    return;
  }
  wrap.innerHTML = entries.map(([course,n])=>`
    <span class="pill course-pill" style="padding:7px 12px;font-size:12px">${escapeHtml(course)} <span style="background:var(--primary);color:white;border-radius:999px;padding:2px 7px;margin-left:4px;font-size:11px">${n}</span></span>
  `).join('');
}

function renderCourseFilterOptions(){
  const select = document.getElementById('courseFilter');
  const current = select.value;
  const courses = [...new Set(students.map(s=>s.course))].sort();
  select.innerHTML = '<option value="all">All Courses</option>' + courses.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if([...select.options].some(o=>o.value===current)) select.value=current;
  else select.value='all';
}

function renderStudentsTable(){
  const tbody = document.getElementById('studentsBody');
  const empty = document.getElementById('studentsEmpty');
  const noRes = document.getElementById('noResults');
  const filtered = getFilteredSorted();
  const total = students.length;

  document.getElementById('resultCount').textContent = `${filtered.length} of ${total} students`;
  document.getElementById('directorySub').textContent = filtered.length===total? `Showing all ${total} student records` : `Filtered ${filtered.length} of ${total} records`;
  // update sort header active state
  document.querySelectorAll('thead th[data-sort]').forEach(th=>{
    th.classList.toggle('active', th.dataset.sort===currentSort.field);
    const icon = th.querySelector('.sort');
    if(icon) icon.textContent = th.dataset.sort===currentSort.field ? (currentSort.dir==='asc'?'↑':'↓') : '↕';
  });

  if(total===0){
    tbody.innerHTML='';
    empty.classList.remove('hidden');
    noRes.classList.add('hidden');
    return;
  }
  if(filtered.length===0){
    tbody.innerHTML='';
    empty.classList.add('hidden');
    noRes.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  noRes.classList.add('hidden');
  tbody.innerHTML = filtered.map(s=>`
    <tr>
      <td><span class="mono">${escapeHtml(s.student_id)}</span></td>
      <td>
        <div class="cell-main">
          <div class="avatar" style="width:28px;height:28px;font-size:11px">${escapeHtml(initials(s.full_name))}</div>
          <strong>${escapeHtml(s.full_name)}</strong>
        </div>
      </td>
      <td style="color:var(--muted)">${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.phone)}</td>
      <td><span class="pill ${s.gender==='Male'?'male':s.gender==='Female'?'female':'other'}">${escapeHtml(s.gender)}</span></td>
      <td><span class="pill course-pill">${escapeHtml(s.course)}</span></td>
      <td style="white-space:nowrap">${formatDOB(s.date_of_birth)}</td>
      <td style="color:var(--muted);white-space:nowrap">${formatDate(s.created_at)}</td>
      <td>
        <div class="actions">
          <button class="icon-btn" title="View" aria-label="View ${escapeHtml(s.full_name)}" onclick="openViewModal(${s.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="icon-btn" title="Edit" aria-label="Edit ${escapeHtml(s.full_name)}" onclick="openEditModal(${s.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" title="Delete" aria-label="Delete ${escapeHtml(s.full_name)}" onclick="openDeleteModal(${s.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function navigate(view){
  document.querySelectorAll('[id^="view-"]').forEach(el=>el.classList.add('hidden'));
  const target = document.getElementById('view-'+view);
  if(target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-view]').forEach(el=>{
    el.classList.toggle('active', el.dataset.view===view);
  });
  const titles = {
    dashboard:['Merit Haji Ismail Sahib Arts & Science College','Pernambut • Student Dashboard'],
    students:['Student Records','Merit Haji Ismail Sahib Arts & Science College']
  };
  const t = titles[view]||titles.dashboard;
  document.getElementById('pageTitle').textContent=t[0];
  document.getElementById('pageSub').textContent=t[1];
  closeSidebar();
  window.scrollTo({top:0,behavior:'smooth'});
}

function toggleSidebar(){
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('show', sb.classList.contains('open'));
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

function onGlobalSearch(v){
  filters.search=v;
  document.getElementById('searchInput').value=v;
  if(document.getElementById('view-students').classList.contains('hidden')){
    navigate('students');
  }
  renderStudentsTable();
}
function onSearch(v){ filters.search=v; document.getElementById('topSearch').value=v; renderStudentsTable(); }
function onGenderFilter(v){ filters.gender=v; renderStudentsTable(); }
function onCourseFilter(v){ filters.course=v; renderStudentsTable(); }
function onSortFilter(v){
  const [field,dir]=v.split('-');
  currentSort={field,dir};
  renderStudentsTable();
}
function toggleSort(field){
  if(currentSort.field===field){
    currentSort.dir = currentSort.dir==='asc'?'desc':'asc';
  } else {
    currentSort.field=field;
    currentSort.dir='asc';
    if(field==='created_at') currentSort.dir='desc';
  }
  document.getElementById('sortFilter').value = currentSort.field+'-'+currentSort.dir;
  renderStudentsTable();
}
function clearFilters(){
  filters={search:'',gender:'all',course:'all'};
  document.getElementById('searchInput').value='';
  document.getElementById('topSearch').value='';
  document.getElementById('genderFilter').value='all';
  document.getElementById('courseFilter').value='all';
  renderStudentsTable();
}

/* Modals */
function openAddModal(){
  editingId=null;
  document.getElementById('modalTitle').textContent='Add Student';
  document.getElementById('modalSub').textContent='Create a new record in the students table';
  document.getElementById('submitBtn').textContent='Add Student';
  document.getElementById('studentForm').reset();
  clearErrors();
  const autoIdEl = document.getElementById('f_student_id');
  autoIdEl.value = generateAdmissionNumber();
  document.getElementById('studentModal').classList.remove('hidden');
  setTimeout(()=>autoIdEl.focus(),50);
}
function openEditModal(id){
  const s = students.find(x=>x.id===id);
  if(!s) return;
  editingId=id;
  document.getElementById('modalTitle').textContent='Edit Student';
  document.getElementById('modalSub').textContent='Update record '+s.student_id;
  document.getElementById('submitBtn').textContent='Update Student';
  clearErrors();
  document.getElementById('f_student_id').value=s.student_id;
  document.getElementById('f_full_name').value=s.full_name;
  document.getElementById('f_email').value=s.email;
  document.getElementById('f_phone').value=s.phone;
  document.getElementById('f_gender').value=s.gender;
  document.getElementById('f_course').value=s.course;
  document.getElementById('f_dob').value=s.date_of_birth;
  document.getElementById('f_admission_date').value=s.admission_date || '';
  document.getElementById('f_batch').value=s.batch || '';
  document.getElementById('f_previous_marks').value=s.previous_marks || '';
  document.getElementById('f_address').value=s.address || '';
  document.getElementById('f_parent_name').value=s.parent_name || '';
  document.getElementById('f_parent_phone').value=s.parent_phone || '';
  document.getElementById('f_parent_occupation').value=s.parent_occupation || '';
  document.getElementById('studentModal').classList.remove('hidden');
}
function closeStudentModal(){
  document.getElementById('studentModal').classList.add('hidden');
  editingId=null;
  clearErrors();
}
function openViewModal(id){
  const s = students.find(x=>x.id===id);
  if(!s) return;
  viewingId=id;
  document.getElementById('v_avatar').textContent=initials(s.full_name);
  document.getElementById('v_name').textContent=s.full_name;
  document.getElementById('v_course').textContent=s.course;
  document.getElementById('v_sid').textContent=s.student_id;
  const pill=document.getElementById('v_gender');
  pill.textContent=s.gender;
  pill.className='pill '+(s.gender==='Male'?'male':s.gender==='Female'?'female':'other');
  document.getElementById('v_email').textContent=s.email;
  document.getElementById('v_phone').textContent=s.phone;
  document.getElementById('v_dob').textContent=formatDOB(s.date_of_birth);
  document.getElementById('v_age').textContent=calcAge(s.date_of_birth);
  document.getElementById('v_admission_date').textContent = s.admission_date ? formatDOB(s.admission_date) : '—';
  document.getElementById('v_batch').textContent = s.batch || '—';
  document.getElementById('v_previous_marks').textContent = s.previous_marks || '—';
  document.getElementById('v_address').textContent = s.address || '—';
  document.getElementById('v_parent_name').textContent = s.parent_name || '—';
  document.getElementById('v_parent_phone').textContent = s.parent_phone || '—';
  document.getElementById('v_parent_occupation').textContent = s.parent_occupation || '—';
  document.getElementById('v_created').textContent=formatDate(s.created_at);
  document.getElementById('v_updated').textContent=formatDate(s.updated_at);
  document.getElementById('viewModal').classList.remove('hidden');
}
function closeViewModal(){ document.getElementById('viewModal').classList.add('hidden'); viewingId=null; }
function editFromView(){ if(viewingId){ const id=viewingId; closeViewModal(); openEditModal(id); } }
function openDeleteModal(id){
  const s = students.find(x=>x.id===id);
  if(!s) return;
  pendingDeleteId=id;
  document.getElementById('deleteName').textContent=s.full_name;
  document.getElementById('deleteSid').textContent=s.student_id;
  document.getElementById('deleteModal').classList.remove('hidden');
}
function closeDeleteModal(){ document.getElementById('deleteModal').classList.add('hidden'); pendingDeleteId=null; }
async function confirmDelete(){
  if(pendingDeleteId==null) return;
  const btn = document.querySelector('#deleteModal button:last-child');
  btn.disabled=true; btn.textContent='Deleting...';
  await delay(350);
  try{
    students = students.filter(s=>s.id!==pendingDeleteId);
    if(!saveToStorage()) throw new Error('save failed');
    closeDeleteModal();
    renderAll();
    showToast('Student deleted successfully','success');
  }catch(e){
    showToast('Database error: could not delete','error');
  }finally{
    btn.disabled=false; btn.textContent='Delete permanently';
  }
}

/* Validation */
function clearErrors(){
  document.querySelectorAll('.field-error').forEach(e=>e.textContent='');
  document.querySelectorAll('.field input,.field select').forEach(e=>e.classList.remove('invalid'));
}
function validate(data){
  const err={};
  const id = (data.student_id || '').trim();
  if(!id) err.student_id='Admission number is required';
  else if(!/^(?:MHIS-\d{4}\d{3}|STU\d{4,})$/i.test(id)) err.student_id='Enter a valid admission number (e.g. MHIS-2024001)';
  if(!data.full_name || data.full_name.trim().length<3) err.full_name='Full name must be at least 3 characters';
  if(!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) err.email='Enter a valid email address';
  if(!data.phone) err.phone='Phone is required';
  else {
    const digits = data.phone.replace(/\D/g,'');
    if(digits.length<10 || digits.length>15) err.phone='Enter a valid phone (10-15 digits)';
  }
  if(!data.gender) err.gender='Please select gender';
  if(!data.course) err.course='Please select a course';
  if(!data.date_of_birth) err.date_of_birth='Date of birth is required';
  else {
    const dob = new Date(data.date_of_birth);
    const now = new Date();
    if(isNaN(dob)) err.date_of_birth='Invalid date';
    else if(dob>now) err.date_of_birth='Date cannot be in the future';
    else {
      const age = now.getFullYear()-dob.getFullYear();
      if(age<15) err.date_of_birth='Student must be at least 15 years old';
      if(age>80) err.date_of_birth='Please check date of birth';
    }
  }
  if(!data.admission_date) err.admission_date='Admission date is required';
  if(!data.batch || !data.batch.trim()) err.batch='Batch is required';
  if(!data.previous_marks || !data.previous_marks.trim()) err.previous_marks='Previous marks are required';
  if(!data.address || !data.address.trim()) err.address='Address is required';
  if(!data.parent_name || !data.parent_name.trim()) err.parent_name='Parent name is required';
  if(!data.parent_phone) err.parent_phone='Parent phone is required';
  else {
    const digits = data.parent_phone.replace(/\D/g,'');
    if(digits.length<10 || digits.length>15) err.parent_phone='Enter a valid parent phone';
  }
  return err;
}
function showFieldErrors(errs){
  Object.entries(errs).forEach(([k,msg])=>{
    const el = document.getElementById('e_'+k);
    if(el) el.textContent=msg;
    const input = document.getElementById('f_'+k);
    if(input) input.classList.add('invalid');
  });
}

document.getElementById('studentForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearErrors();
  const fd = new FormData(e.target);
  const data = {
    student_id: (fd.get('student_id')||'').toString().trim(),
    full_name: (fd.get('full_name')||'').toString().trim(),
    email: (fd.get('email')||'').toString().trim(),
    phone: (fd.get('phone')||'').toString().trim(),
    gender: (fd.get('gender')||'').toString(),
    course: (fd.get('course')||'').toString(),
    date_of_birth: (fd.get('date_of_birth')||'').toString(),
    admission_date: (fd.get('admission_date')||'').toString(),
    batch: (fd.get('batch')||'').toString().trim(),
    previous_marks: (fd.get('previous_marks')||'').toString().trim(),
    address: (fd.get('address')||'').toString().trim(),
    parent_name: (fd.get('parent_name')||'').toString().trim(),
    parent_phone: (fd.get('parent_phone')||'').toString().trim(),
    parent_occupation: (fd.get('parent_occupation')||'').toString().trim()
  };
  const errs = validate(data);
  if(Object.keys(errs).length){
    showFieldErrors(errs);
    showToast('Please fix validation errors','error');
    return;
  }
  const duplicate = students.find(s=> s.student_id.toLowerCase()===data.student_id.toLowerCase() && s.id!==editingId);
  if(duplicate){
    showFieldErrors({student_id:'Student ID already exists'});
    showToast('Duplicate Student ID — must be unique','error');
    return;
  }
  const btn = document.getElementById('submitBtn');
  const orig = btn.textContent;
  btn.disabled=true; btn.textContent='Saving...';
  await delay(380);
  try{
    if(editingId){
      const idx = students.findIndex(s=>s.id===editingId);
      if(idx===-1) throw new Error('not found');
      students[idx] = { ...students[idx], ...data, updated_at:new Date().toISOString() };
      if(!saveToStorage()) throw new Error('save failed');
      showToast('Student updated successfully','success');
    } else {
      const newId = students.length? Math.max(...students.map(s=>s.id))+1 : 1;
      const now = new Date().toISOString();
      students.push({ id:newId, ...data, created_at:now, updated_at:now });
      if(!saveToStorage()) throw new Error('save failed');
      showToast('Student added successfully','success');
    }
    closeStudentModal();
    renderAll();
  }catch(err){
    showToast('Database error: failed to save record','error');
  }finally{
    btn.disabled=false; btn.textContent=orig;
  }
});

/* Toast */
function showToast(message, type='info'){
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className='toast '+type;
  const icons = {
    success:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
    error:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
    info:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    warning:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.3L3.3 17a2 2 0 0 0 1.7 3h13a2 2 0 0 0 1.7-3L12.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'
  };
  toast.innerHTML=`
    <div class="toast-icon">${icons[type]||icons.info}</div>
    <div style="flex:1;min-width:0">
      <strong>${type==='success'?'Success':type==='error'?'Error':type==='warning'?'Warning':'Notice'}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    <button aria-label="Dismiss" onclick="this.closest('.toast').remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(()=>{ toast.style.opacity='0'; toast.style.transform='translateX(8px)'; setTimeout(()=>toast.remove(),220); }, 3400);
}

/* Settings actions */
function exportJSON(){
  const blob = new Blob([JSON.stringify(students,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='students-db.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('Database exported as JSON','success');
}
function importJSON(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!Array.isArray(data)) throw new Error('Invalid format');
      // basic validation
      students = data.map((s,i)=>({
        id: s.id||i+1,
        student_id: String(s.student_id||'STU'+(2000+i)),
        full_name: String(s.full_name||'Unknown'),
        email: String(s.email||'unknown@university.edu'),
        phone: String(s.phone||'000-000-0000'),
        gender: ['Male','Female','Other'].includes(s.gender)? s.gender:'Other',
        course: String(s.course||'Computer Science'),
        date_of_birth: s.date_of_birth||'2000-01-01',
        created_at: s.created_at||new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      saveToStorage();
      renderAll();
      showToast('Database imported successfully','success');
    }catch(err){
      showToast('Import failed: invalid JSON','error');
    }
  };
  reader.readAsText(file);
  e.target.value='';
}
async function resetDatabase(){
  if(!confirm('Clear all student records? This cannot be undone.')) return;
  await delay(250);
  students = [];
  saveToStorage();
  renderAll();
  showToast('Student database cleared','success');
}

/* Modal outside click & esc */
['studentModal','viewModal','deleteModal'].forEach(id=>{
  document.getElementById(id).addEventListener('click', (e)=>{
    if(e.target===e.currentTarget){
      if(id==='studentModal') closeStudentModal();
      if(id==='viewModal') closeViewModal();
      if(id==='deleteModal') closeDeleteModal();
    }
  });
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape'){
    closeStudentModal(); closeViewModal(); closeDeleteModal(); closeSidebar();
  }
});

/* Init */
document.addEventListener('DOMContentLoaded', ()=>{
  loadStudents();
});