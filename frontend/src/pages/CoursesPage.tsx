import { translateText } from '../i18n/context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import YouTube, { type YouTubePlayer } from 'react-youtube';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api, messageFromError } from '../api';
import { PageTitle } from './RecordsPage';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type CourseRow = { id: string; title: string; description?: string; category: string; status: string; rejectionReason?: string; targetAudience?: string; duration?: string; objectives?: string; lessons?: string[]; thumbnailUrl?: string; startDate?: string; locked?: boolean; lockedByCourseTitle?: string | null; completed?: boolean; progressPercentage?: number; materials?: Array<{ id: string; title: string; type: string; status: string; lessonNumber?: number | null; fileUrl?: string; onlineUrl?: string }> };
const COURSE_CATEGORIES: Array<[string, string, string]> = [['BEGINNER','Beginner Course','🌱'],['HOUSEHOLD','Home Cell Advanced Course','🏠'],['CHILDREN','Children Course','🧒'],['NORMAL_DAY_TO_DAY','Day-to-Day Course','📖']];
const COURSE_DURATIONS = ['1 week', '2 weeks', '3 weeks', '4 weeks', '6 weeks', '8 weeks', '10 weeks', '12 weeks', '1 month', '2 months', '3 months', '6 months', '1 year'];
const courseCategoryLabel = (category: string) => translateText(category === 'HOUSEHOLD' ? 'Home Cell Advanced Course' : category === 'BEGINNER' ? 'Beginner Course' : category === 'NORMAL_DAY_TO_DAY' ? 'Day-to-Day Course' : category === 'CHILDREN' ? 'Children Course' : category.replaceAll('_', ' '));
const courseSchema = z.object({ title: z.string().trim().min(2,'Enter at least 2 characters.').max(160,'Use 160 characters or fewer.'), category: z.enum(['BEGINNER','HOUSEHOLD','CHILDREN','NORMAL_DAY_TO_DAY']), description: z.string().max(8000,'Use 8,000 characters or fewer.'), duration: z.string().max(100,'Use 100 characters or fewer.'), objectives: z.string().max(4000,'Use 4,000 characters or fewer.'), lessons: z.string().max(20000,'Lesson list is too long.').refine(value=>value.split('\n').filter(line=>line.trim()).length<=100,'Add no more than 100 lessons.'), targetAudience: z.enum(['WORSHIPERS','MEMBERS','MEMBERS_AND_WORSHIPERS','CHILDREN']),thumbnailUrl:z.string().url('Enter a valid URL.').or(z.literal('')),meetingPlatform:z.enum(['Zoom','Google Classroom']),meetingUrl:z.string().url('Enter a valid class link.').or(z.literal('')) });
export function CoursesPage({ instructor = false, manager = false }: { instructor?: boolean; manager?: boolean }) {
  const [courses,setCourses]=useState<CourseRow[]>([]);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const navigate=useNavigate();const {courseId}=useParams();
  const [formOpen,setFormOpen]=useState(false);const[editingId,setEditingId]=useState<string|null>(null);const[categoryFilter,setCategoryFilter]=useState<string|null>(null); const form=useForm({resolver:zodResolver(courseSchema),defaultValues:{title:'',category:'BEGINNER' as const,description:'',duration:'',objectives:'',lessons:'',targetAudience:'MEMBERS_AND_WORSHIPERS' as const,thumbnailUrl:'',meetingPlatform:'Zoom' as const,meetingUrl:''}});
  const watchedCategory=form.watch('category');
  const watchedDuration=form.watch('duration');
  const endpoint=manager?'/manager/courses':instructor?'/instructor/courses':'/courses';
  const load=()=>api.get(endpoint).then(({data})=>setCourses(data.courses??[])).catch(e=>setError(messageFromError(e)));
  const visibleCourses=categoryFilter?courses.filter(course=>course.category===categoryFilter):courses;
  useEffect(()=>{if(courseId&&!instructor&&!manager)return;void load();},[endpoint,courseId,instructor,manager]);
  const create=form.handleSubmit(async(values,event)=>{let courseId=editingId;const submitter=(event?.nativeEvent as SubmitEvent|undefined)?.submitter;const submitForReview=submitter instanceof HTMLButtonElement&&submitter.value==='submit';try{const {lessons,meetingPlatform,meetingUrl,...other}=values;const payload={...other,targetAudience:values.category==='HOUSEHOLD'?'MEMBERS':values.targetAudience,thumbnailUrl:other.thumbnailUrl||undefined,lessons:(lessons??'').split('\n').map(s=>s.trim()).filter(Boolean)};if(editingId)await api.patch(`/instructor/courses/${editingId}`,payload);else{const {data}=await api.post('/instructor/courses',payload);courseId=data.course.id;setEditingId(courseId);}if(meetingUrl&&courseId){const existingMeeting=editingId?courses.find(course=>course.id===editingId)?.materials?.find(material=>material.type==='ONLINE_MEETING'&&material.onlineUrl):undefined;if(existingMeeting){await api.patch(`/instructor/courses/${courseId}/materials/${existingMeeting.id}`,{title:`${meetingPlatform} class`,onlineUrl:meetingUrl});}else{const material=new FormData();material.append('onlineUrl',meetingUrl);material.append('type','OTHER');material.append('title',`${meetingPlatform} class`);await api.post(`/instructor/courses/${courseId}/materials`,material,{headers:{'Content-Type':'multipart/form-data'}});}}if(submitForReview&&courseId)await api.post(`/instructor/courses/${courseId}/submit`);setSuccess(submitForReview?'Submitted to the Administrator for review.':editingId?'Course draft updated.':'Course draft saved.');form.reset();setFormOpen(false);setEditingId(null);await load();}catch(e){setError(messageFromError(e));}});
  const edit=(course:CourseRow)=>{const meeting=course.materials?.find(material=>material.type==='ONLINE_MEETING'&&material.onlineUrl);setEditingId(course.id);form.reset({title:course.title,category:course.category as 'BEGINNER'|'HOUSEHOLD'|'CHILDREN'|'NORMAL_DAY_TO_DAY',description:course.description??'',duration:course.duration??'',objectives:course.objectives??'',lessons:(course.lessons??[]).join('\n'),targetAudience:(course.targetAudience??'MEMBERS_AND_WORSHIPERS') as 'WORSHIPERS'|'MEMBERS'|'MEMBERS_AND_WORSHIPERS'|'CHILDREN',thumbnailUrl:course.thumbnailUrl??'',meetingPlatform:meeting?.title.includes('Google Classroom')?'Google Classroom':'Zoom',meetingUrl:meeting?.onlineUrl??''});setFormOpen(true);};
  const review=async(id:string,decision:'approve'|'reject')=>{const notes=decision==='reject'?window.prompt('Add a rejection reason for the instructor:'):'';if(decision==='reject'&&!notes)return;try{await api.post(`/manager/courses/${id}/review`,{decision,notes});setSuccess(decision==='approve'?'Course published for eligible learners.':'Feedback sent to the instructor.');await load();}catch(e){setError(messageFromError(e));}};
  const reviewMaterial=async(id:string,decision:'approve'|'reject')=>{const notes=decision==='reject'?window.prompt('Add a rejection reason for the instructor:'):'';if(decision==='reject'&&!notes)return;try{await api.post(`/manager/materials/${id}/review`,{decision,notes});setSuccess(decision==='approve'?'Material approved for eligible learners.':'Feedback sent to the instructor.');await load();}catch(e){setError(messageFromError(e));}};
  const submit=async(id:string)=>{try{await api.post(`/instructor/courses/${id}/submit`);setSuccess('Submitted to the Administrator for review.');await load();}catch(e){setError(messageFromError(e));}};
  const deletePublishedCourse=async(course:CourseRow)=>{if(!window.confirm(`Delete the published course "${course.title}"? This will also remove its lessons, materials, enrollments, and progress.`))return;try{await api.delete(`/instructor/courses/${course.id}`);setSuccess('Published course deleted.');await load();}catch(e){setError(messageFromError(e));}};
  if(courseId&&!instructor&&!manager)return <CourseStudy courseId={courseId} />;
  return <div className="content-wrap"><PageTitle title={manager?'Courses & Classes':instructor?'My Courses':'Courses & Classes'} description={translateText(manager?'Review instructor course and learning material submissions.':instructor?'Create courses and send learning materials for review.':'Browse the approved courses available to your account.')} />{error&&<div className="error-banner">{error}</div>}{success&&<div className="success-banner">{success}</div>}
    {instructor&&<><div className="instructor-category-grid">{COURSE_CATEGORIES.map(([key,label,icon])=><article className={`instructor-category-card${categoryFilter===key?' selected':''}`} key={key}><button type="button" className="instructor-category-select" onClick={()=>setCategoryFilter(current=>current===key?null:key)}><span>{icon}</span><strong>{label}</strong><small>{courses.filter(course=>course.category===key).length} {translateText("courses")}</small></button><button type="button" className="btn-outline" onClick={()=>{setEditingId(null);setCategoryFilter(key);form.reset({title:'',category:key as 'BEGINNER'|'HOUSEHOLD'|'CHILDREN'|'NORMAL_DAY_TO_DAY',description:'',duration:'',objectives:'',lessons:'',targetAudience:key==='HOUSEHOLD'?'MEMBERS':'MEMBERS_AND_WORSHIPERS',thumbnailUrl:'',meetingPlatform:'Zoom',meetingUrl:''});setFormOpen(true);}}>{translateText("＋ Create course")}</button></article>)}</div><button type="button" className="category-chip" onClick={()=>setCategoryFilter(null)}>{translateText("All categories")}</button></>}
    {instructor&&formOpen&&<section className="panel"><h2>{editingId?translateText("Edit course"):translateText("Course details")}</h2><form className="form-grid" noValidate onSubmit={create}>
      <label className="field"><span>{translateText("Course title")}</span><input maxLength={160} required aria-invalid={!!form.formState.errors.title} {...form.register('title')} />{form.formState.errors.title&&<small className="field-error">{form.formState.errors.title.message}</small>}</label>
      <label className="field"><span>{translateText("Duration")}</span><select {...form.register('duration')}><option value="">{translateText("Select duration")}</option>{watchedDuration&&!COURSE_DURATIONS.includes(watchedDuration)&&<option value={watchedDuration}>{watchedDuration}</option>}{COURSE_DURATIONS.map(duration=><option key={duration} value={duration}>{translateText(duration)}</option>)}</select></label>
      <label className="field"><span>{translateText("Target audience")}</span><select disabled={watchedCategory==='HOUSEHOLD'} {...form.register('targetAudience')}><option value="WORSHIPERS">{translateText("Worshipers")}</option><option value="MEMBERS">{translateText("Members")}</option><option value="MEMBERS_AND_WORSHIPERS">{translateText("Members and Worshipers")}</option><option value="CHILDREN">{translateText("Children")}</option></select>{watchedCategory==='HOUSEHOLD'&&<small>{translateText("Home Cell Advanced courses are for Members.")}</small>}</label>
      <label className="field"><span>{translateText("Course thumbnail URL")}</span><input type="url" maxLength={2048} placeholder={translateText("https://")} {...form.register('thumbnailUrl')} />{form.formState.errors.thumbnailUrl&&<small className="field-error" role="alert">{form.formState.errors.thumbnailUrl.message}</small>}</label>
      <label className="field"><span>{translateText("Online class platform")}</span><select {...form.register('meetingPlatform')}><option value="Zoom">{translateText("Zoom")}</option><option value="Google Classroom">{translateText("Google Classroom")}</option></select></label>
      <label className="field"><span>{translateText("Zoom / Google Classroom link")}</span><input type="url" maxLength={2048} placeholder={translateText("https://")} {...form.register('meetingUrl')} />{form.formState.errors.meetingUrl&&<small className="field-error">{translateText("Enter a valid online class link.")}</small>}</label>
      <label className="field wide"><span>{translateText("Description")}</span><textarea rows={3} maxLength={8000} {...form.register('description')} />{form.formState.errors.description&&<small className="field-error" role="alert">{form.formState.errors.description.message}</small>}</label>
      <label className="field wide"><span>{translateText("Learning objectives")}</span><textarea rows={2} maxLength={4000} {...form.register('objectives')} />{form.formState.errors.objectives&&<small className="field-error" role="alert">{form.formState.errors.objectives.message}</small>}</label>
      <label className="field wide"><span>{translateText("Lessons (one per line)")}</span><textarea rows={4} maxLength={20000} {...form.register('lessons')} />{form.formState.errors.lessons&&<small className="field-error" role="alert">{form.formState.errors.lessons.message}</small>}</label>
      <div className="button-row"><button type="submit" className="btn-outline" disabled={form.formState.isSubmitting}>{translateText("Save Draft")}</button><button type="submit" name="action" value="submit" className="btn-primary" disabled={form.formState.isSubmitting}>{translateText("Submit for Administrator review")}</button></div>
    </form></section>}
    {!visibleCourses.length?<div className="empty-card"><span>{translateText("✧")}</span><strong>{translateText("No courses to show")}</strong><p>{categoryFilter?translateText("No courses in this category yet. Create one from its category box."):translateText("Courses appear here when assigned, published, or created.")}</p></div>:<div className="record-grid">{visibleCourses.map(course=><article className="record-card" key={course.id}><div className="record-top"><span className="record-avatar">{translateText("✦")}</span><span className={`status-tag ${course.status.toLowerCase()}`}>{translateText(course.status.replaceAll('_',' '))}</span></div><small className="eyebrow">{courseCategoryLabel(course.category)}</small><h2>{translateText(course.title)}</h2><p className="record-subtitle">{translateText(course.description || 'Church learning course')}</p>{course.status==='PUBLISHED'&&!instructor&&!manager&&<small>{course.completed?translateText("Course completed"):translateText("Course progress")}{translateText(": ")}{course.progressPercentage??0}{translateText("%")}</small>}{course.locked&&course.lockedByCourseTitle&&<p className="feedback-note">{translateText("Complete ")}{translateText(course.lockedByCourseTitle)}{translateText(" before opening this course.")}</p>}{course.rejectionReason&&<p className="feedback-note">{translateText("Manager feedback: ")}{course.rejectionReason}</p>}
      {manager&&course.status==='PENDING_APPROVAL'&&<div className="button-row"><button className="btn-primary" onClick={()=>review(course.id,'approve')}>{translateText("Approve & publish")}</button><button className="btn-outline-danger" onClick={()=>review(course.id,'reject')}>{translateText("Reject")}</button></div>}
      {manager&&course.materials?.filter(material=>material.status==='PENDING_APPROVAL').map(material=><div className="material-review" key={material.id}><strong>{material.title}</strong><small>{material.type.replaceAll('_',' ')} {translateText("· waiting for review")}</small><div className="button-row"><button className="btn-primary compact-button" onClick={()=>reviewMaterial(material.id,'approve')}>{translateText("Approve material")}</button><button className="btn-outline-danger compact-button" onClick={()=>reviewMaterial(material.id,'reject')}>{translateText("Reject")}</button></div></div>)}
      {instructor&&<><div className="material-list">{course.materials?.map(material=><div key={material.id}><span>{material.title}</span><small>{material.type.replaceAll('_',' ')}{material.lessonNumber ? ` · Lesson ${material.lessonNumber}` : translateText("")} {translateText("· ")}{material.status.replaceAll('_',' ')}</small></div>)}</div>{(course.status==='DRAFT'||course.status==='REJECTED')&&<><button className="btn-outline" onClick={()=>edit(course)}>{translateText("Edit course")}</button><MaterialUpload courseId={course.id} lessonCount={course.lessons?.length ?? 0} onSaved={load} /><button className="btn-primary" onClick={()=>submit(course.id)}>{translateText("Submit for Administrator review")}</button></>}{course.status==='PUBLISHED'&&<><MaterialUpload courseId={course.id} lessonCount={course.lessons?.length ?? 0} onSaved={load} /><button className="btn-outline-danger" onClick={()=>void deletePublishedCourse(course)}>{translateText("Delete published course")}</button></>}</>}
      {!manager&&!instructor&&<button className="btn-outline" disabled={course.locked} onClick={()=>navigate(`/courses/${course.id}`)}>{course.locked?translateText("Complete previous course to unlock"):course.completed?translateText("Review completed course"):translateText("Open course & lessons")}</button>}
    </article>)}</div>}
  </div>;
}

function CourseStudy({courseId}:{courseId:string}){
  const [detail,setDetail]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [loadAttempt,setLoadAttempt]=useState(0);
  const [completed,setCompleted]=useState<number[]>([]);
  const [expandedLessonIndex,setExpandedLessonIndex]=useState(0);
  const [watchedVideoSegments,setWatchedVideoSegments]=useState<Record<string,number[]>>({});
  const [watchedBiblePages,setWatchedBiblePages]=useState<Record<string,{pageCount:number;pages:number[]}>>({});
  const [pendingManualLessons,setPendingManualLessons]=useState<number[]>([]);
  const [error,setError]=useState('');
  const [saveState,setSaveState]=useState<'idle'|'saving'|'saved'>('idle');
  const [certificate,setCertificate]=useState<{certificateNumber:string;verificationCode:string;courseTitleSnapshot?:string}|null>(null);
  const watchedSegmentsRef=useRef<Record<string,number[]>>({});
  const manualLessonsRef=useRef<number[]>([]);
  const watchProgressDirty=useRef(false);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');setDetail(null);
    api.get(`/courses/${courseId}`,{timeout:15000}).then(({data})=>{
      if(!active)return;
      setDetail({ course: data.course, progress: data.progress });
      const savedCompleted=data.progress?.completedLessons??[];
      setCompleted(savedCompleted);
      const lessonCount=Array.isArray(data.course.lessons)?data.course.lessons.length:0;
      const firstIncomplete=Array.from({length:lessonCount},(_,index)=>index).find(index=>!savedCompleted.includes(index));
      setExpandedLessonIndex(firstIncomplete??Math.max(0,lessonCount-1));
      const currentVideoIds=new Set((data.course.materials??[]).filter((material:any)=>material.type==='VIDEO').map((material:any)=>material.id));
      const savedSegments=Object.fromEntries(Object.entries(data.progress?.watchedVideoSegments??{}).filter(([videoId])=>currentVideoIds.has(videoId))) as Record<string,number[]>;
      watchedSegmentsRef.current=savedSegments;
      setWatchedVideoSegments(savedSegments);
      setWatchedBiblePages(data.progress?.watchedBiblePages??{});
      manualLessonsRef.current=[];
      setPendingManualLessons([]);
    }).catch(error=>{
      if(active)setError(messageFromError(error));
    }).finally(()=>{
      if(active)setLoading(false);
    });
    return()=>{active=false;};
  },[courseId,loadAttempt]);
  const course=detail?.course as CourseRow|undefined;
  const lessons=Array.isArray(course?.lessons)?course.lessons:[];
  const materials=Array.isArray(course?.materials)?course.materials:[];
  const videos=materials.filter(material=>material.type==='VIDEO'&&material.lessonNumber!=null);
  const progress=detail?.progress?.percentage??0;
  const firstIncompleteIndex=lessons.findIndex((_,index)=>!completed.includes(index));
  const lastUnlockedIndex=firstIncompleteIndex<0?lessons.length-1:firstIncompleteIndex;
  const save=async()=>{
    if(!watchProgressDirty.current)return;
    const submittedSegments=watchedSegmentsRef.current;
    const submittedBible=watchedBiblePages;
    const submittedManualLessons=manualLessonsRef.current;
    try{
      setError('');
      setSaveState('saving');
      const {data}=await api.post(`/courses/${courseId}/progress`,{
        watchedVideoSegments:submittedSegments,
        watchedBiblePages:submittedBible,
        manualCompletedLessons:submittedManualLessons,
      });
      setCertificate(data.certificate??null);
      setError(data.certificateIssueError??'');
      setDetail((value:any)=>({...value,progress:data.progress}));
      const savedCompleted=data.progress.completedLessons??[];
      const completedNewLesson=savedCompleted.some((index:number)=>!completed.includes(index));
      setCompleted(savedCompleted);
      if(completedNewLesson){
        const nextLessonIndex=lessons.findIndex((_,index)=>!savedCompleted.includes(index));
        setExpandedLessonIndex(nextLessonIndex<0?Math.max(0,lessons.length-1):nextLessonIndex);
      }
      if(JSON.stringify(submittedSegments)===JSON.stringify(watchedSegmentsRef.current)&&JSON.stringify(submittedBible)===JSON.stringify(watchedBiblePages)&&JSON.stringify(submittedManualLessons)===JSON.stringify(manualLessonsRef.current)){
        watchProgressDirty.current=false;
        manualLessonsRef.current=[];
        setPendingManualLessons([]);
        setSaveState('saved');
      }
    }catch(e){
      setError(messageFromError(e));
      setSaveState('idle');
    }
  };
  const updateWatchedSegments=useCallback((videoId:string,segments:number[])=>{const next={...watchedSegmentsRef.current,[videoId]:segments};watchedSegmentsRef.current=next;watchProgressDirty.current=true;setWatchedVideoSegments(next);setSaveState('idle');setCertificate(null);},[]);
  const updateWatchedBiblePages=useCallback((materialId:string,pageCount:number,pages:number[])=>{setWatchedBiblePages(current=>{const next={...current,[materialId]:{pageCount:Math.max(current[materialId]?.pageCount??0,pageCount),pages:[...new Set([...(current[materialId]?.pages??[]),...pages])].sort((a,b)=>a-b)}};watchProgressDirty.current=true;setSaveState('idle');setCertificate(null);return next;});},[]);
  const markLessonFinished=useCallback((index:number)=>{if(index>lastUnlockedIndex||completed.includes(index))return;manualLessonsRef.current=[...new Set([...manualLessonsRef.current,index])];setPendingManualLessons(manualLessonsRef.current);watchProgressDirty.current=true;setSaveState('idle');setCertificate(null);},[completed,lastUnlockedIndex]);
  useEffect(()=>{if(!watchProgressDirty.current)return;const timer=window.setTimeout(()=>void save(),1000);return()=>window.clearTimeout(timer);},[watchedVideoSegments,watchedBiblePages,pendingManualLessons]);
  if(loading)return <main className="content-wrap course-study-page"><Link className="course-study-back" to="/courses">{translateText("← Back to Courses")}</Link><div className="course-study-loading"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-text"/><div className="skeleton skeleton-card"/></div></main>;
  if(error||!course)return <main className="content-wrap course-study-page"><Link className="course-study-back" to="/courses">{translateText("← Back to Courses")}</Link><section className="course-study-error"><h1>{translateText("Course couldn’t be loaded")}</h1><p>{error||'This course is unavailable or you do not have access to it.'}</p><button className="btn-primary" onClick={()=>setLoadAttempt(attempt=>attempt+1)}>{translateText("Try again")}</button></section></main>;
  return <main className="content-wrap course-study-page"><Link className="course-study-back" to="/courses">{translateText("← Back to Courses")}</Link><header className="course-study-header"><div><p className="eyebrow">{courseCategoryLabel(course.category)}</p><h1 id="study-title">{course.title}</h1>{course.description&&<p>{course.description}</p>}</div><div className="course-progress-summary"><strong>{progress}{translateText("%")}</strong><span>{translateText("Course progress")}</span></div></header><div className="course-progress-bar"><div className="progress-track"><span style={{width:`${progress}%`}} /></div><small>{translateText("Finish each lesson using its checkbox to unlock the next one.")}</small></div>
    {error&&<div className="error-banner">{error}</div>}
    <div className="study-lesson-list">{lessons.map((lesson,index)=>{
      const lessonVideos=videos.filter(video=>video.lessonNumber===index+1);
      const lessonMaterials=materials.filter(material=>material.lessonNumber===index+1&&material.type!=='VIDEO');
      const lessonComplete=completed.includes(index);
      const lessonLocked=index>lastUnlockedIndex;
      const lessonExpanded=expandedLessonIndex===index;
      return <section className={`study-lesson${lessonComplete?' complete':''}${lessonLocked?' locked':''}`} key={index}>
        <button type="button" className="study-lesson-toggle" aria-expanded={lessonExpanded} aria-controls={`course-lesson-${index}`} disabled={lessonLocked} onClick={()=>setExpandedLessonIndex(current=>current===index?-1:index)}>
          <span className="study-lesson-heading"><strong>{translateText("Lesson ")}{index+1}</strong><small>{lesson}</small></span>
          <span className="study-lesson-status">{lessonLocked?translateText("Complete the previous lesson"):lessonComplete?translateText("Completed"):lessonVideos.length?translateText("Watch each video"):translateText("Video required")} <span aria-hidden="true">{lessonExpanded?translateText("−"):translateText("+")}</span></span>
        </button>
        {lessonExpanded&&<div className="study-lesson-content" id={`course-lesson-${index}`}>
          {lessonVideos.length?lessonVideos.map(video=><LessonVideoPlayer key={video.id} material={video} watchedSegments={watchedVideoSegments[video.id]??[]} onWatchedSegments={updateWatchedSegments} />):<p className="lesson-video-missing">{translateText("An Instructor must add a published video for this lesson before it can be completed.")}</p>}
          {lessonMaterials.length>0&&<div className="lesson-materials"><strong>{translateText("Lesson materials")}</strong>{lessonMaterials.map(material=>material.type==='PDF_BOOK'&&material.fileUrl?<BibleBookReader key={material.id} material={material} reading={watchedBiblePages[material.id]} onReadPages={updateWatchedBiblePages} />:<a className="lesson-material-link" key={material.id} href={material.fileUrl??material.onlineUrl??'#'} target="_blank" rel="noreferrer"><span>{material.type==='PDF_BOOK'?translateText("📖"):translateText("↗")} {material.title}</span><small>{material.type.replaceAll('_',' ')}</small></a>)}</div>}
          {!lessonComplete&&<label className="lesson-manual-complete"><input type="checkbox" checked={pendingManualLessons.includes(index)} disabled={lessonLocked||pendingManualLessons.includes(index)} onChange={event=>{if(event.currentTarget.checked)markLessonFinished(index);}} /><span>{translateText("I have finished this lesson")}</span></label>}
        </div>}
      </section>;
    })}</div>
    {materials.some(material=>material.lessonNumber==null)&&<div className="lesson-materials course-level-materials"><strong>{translateText("Course materials")}</strong>{materials.filter(material=>material.lessonNumber==null).map(material=><a className="lesson-material-link" key={material.id} href={material.fileUrl??material.onlineUrl??'#'} target="_blank" rel="noreferrer"><span>{material.type==='PDF_BOOK'?translateText("📖"):translateText("↗")} {material.title}</span><small>{material.type.replaceAll('_',' ')}</small></a>)}</div>}
    {saveState==='saving'&&<p className="mgr-muted">{translateText("Saving watched progress…")}</p>}{saveState==='saved'&&!certificate&&<p className="success-banner">{translateText("Watched progress saved.")}</p>}{certificate&&<div className="success-banner">{translateText("Certificate issued for ")}{certificate.courseTitleSnapshot??course.title}{translateText(". ")}<Link to={`/verify/${certificate.verificationCode}`}>{translateText("Verify certificate")}</Link> {translateText("· ")}<Link to="/certificates">{translateText("Certificate Center")}</Link></div>}{error&&<div className="error-banner">{error}</div>}</main>;
}

type LessonVideoMaterial = { id: string; title: string; fileUrl?: string; onlineUrl?: string };
function LessonVideoPlayer({material,watchedSegments,onWatchedSegments}:{material:LessonVideoMaterial;watchedSegments:number[];onWatchedSegments:(videoId:string,segments:number[])=>void}){
  const [player,setPlayer]=useState<YouTubePlayer|null>(null);
  const [playing,setPlaying]=useState(false);
  const [watchCoverage,setWatchCoverage]=useState(watchedSegments.length);
  const watchedRef=useRef(watchedSegments);
  const previousTime=useRef<number|null>(null);
  const polling=useRef(false);
  useEffect(()=>{watchedRef.current=watchedSegments;setWatchCoverage(watchedSegments.length);},[watchedSegments]);

  useEffect(()=>{
    if(!player||!playing)return;
    let active=true;
    const timer=window.setInterval(async()=>{
      if(polling.current)return;
      polling.current=true;
      try{
        const [currentTime,duration]=await Promise.all([player.getCurrentTime(),player.getDuration()]);
        if(!active||!Number.isFinite(currentTime)||!Number.isFinite(duration)||duration<=0)return;
        const previous=previousTime.current;
        if(previous!==null&&currentTime>previous&&currentTime-previous<=2.5){
          const first=Math.floor(previous/duration*100);
          const last=Math.min(99,Math.ceil(currentTime/duration*100)-1);
          if(last>=first){
            const next=[...new Set([...watchedRef.current,...Array.from({length:last-first+1},(_,offset)=>first+offset)])].filter(segment=>segment>=0&&segment<100).sort((a,b)=>a-b);
            if(next.length!==watchedRef.current.length){watchedRef.current=next;setWatchCoverage(next.length);onWatchedSegments(material.id,next);}
          }
        }
        previousTime.current=currentTime;
      }catch{/* Player may be buffering or initializing. */}
      finally{polling.current=false;}
    },500);
    return()=>{active=false;window.clearInterval(timer);previousTime.current=null;};
  },[player,playing,onWatchedSegments]);

  const videoId=youtubeVideoId(material.onlineUrl);
  return <div className="lesson-video">
    <strong>{material.title}</strong>
    {videoId?<YouTube videoId={videoId} title={material.title} className="lesson-video-player" opts={{width:'100%',height:'100%',playerVars:{playsinline:1,rel:0}}} onReady={event=>setPlayer(event.target)} onPlay={()=>{previousTime.current=null;setPlaying(true);}} onPause={()=>setPlaying(false)} onEnd={()=>setPlaying(false)} onStateChange={event=>{if(event.data===1)setPlaying(true);else if(event.data===0||event.data===2||event.data===5)setPlaying(false);}} />
      :material.fileUrl?<NativeLessonVideo material={material} watchedSegments={watchedSegments} onWatchedSegments={onWatchedSegments} />
      :<p className="lesson-video-missing">{translateText("This video link can’t be tracked. Ask the Instructor to upload a playable video or add a YouTube link.")}</p>}
    <small>{watchCoverage}{translateText("% watched · 95% required")}</small>
  </div>;
}

function NativeLessonVideo({material,watchedSegments,onWatchedSegments}:{material:LessonVideoMaterial;watchedSegments:number[];onWatchedSegments:(videoId:string,segments:number[])=>void}){
  const previousTime=useRef<number|null>(null);
  const watchedRef=useRef(watchedSegments);
  useEffect(()=>{watchedRef.current=watchedSegments;},[watchedSegments]);
  const trackPlayback=(currentTime:number,duration:number)=>{
    const previous=previousTime.current;
    if(previous!==null&&currentTime>previous&&currentTime-previous<=2.5&&duration>0){
      const first=Math.floor(previous/duration*100);
      const last=Math.min(99,Math.ceil(currentTime/duration*100)-1);
      if(last>=first){
        const next=[...new Set([...watchedRef.current,...Array.from({length:last-first+1},(_,offset)=>first+offset)])].filter(segment=>segment>=0&&segment<100).sort((a,b)=>a-b);
        if(next.length!==watchedRef.current.length){watchedRef.current=next;onWatchedSegments(material.id,next);}
      }
    }
    previousTime.current=currentTime;
  };
  return <video className="lesson-video-native" controls preload="metadata" src={material.fileUrl} onSeeking={()=>{previousTime.current=null;}} onTimeUpdate={event=>trackPlayback(event.currentTarget.currentTime,event.currentTarget.duration)} onPause={()=>{previousTime.current=null;}} />;
}

type BibleBookMaterial = { id: string; title: string; fileUrl?: string };
function BibleBookReader({material,reading,onReadPages}:{material:BibleBookMaterial;reading?:{pageCount:number;pages:number[]};onReadPages:(materialId:string,pageCount:number,pages:number[])=>void}){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const [documentProxy,setDocumentProxy]=useState<PDFDocumentProxy|null>(null);
  const [pageNumber,setPageNumber]=useState(1);
  const [error,setError]=useState('');
  const [focused,setFocused]=useState(()=>document.visibilityState==='visible'&&document.hasFocus());
  const readPages=reading?.pages??[];

  useEffect(()=>{
    let active=true;
    if(!material.fileUrl)return;
    const loadingTask=getDocument({url:material.fileUrl});
    setError('');
    loadingTask.promise.then(pdf=>{
      if(active)setDocumentProxy(pdf);
    }).catch(loadError=>{
      if(active)setError(loadError instanceof Error?loadError.message:'The Bible book could not be opened.');
    });
    return()=>{active=false;void loadingTask.destroy();};
  },[material.fileUrl]);

  useEffect(()=>{
    const updateFocus=()=>setFocused(document.visibilityState==='visible'&&document.hasFocus());
    document.addEventListener('visibilitychange',updateFocus);
    window.addEventListener('focus',updateFocus);
    window.addEventListener('blur',updateFocus);
    return()=>{document.removeEventListener('visibilitychange',updateFocus);window.removeEventListener('focus',updateFocus);window.removeEventListener('blur',updateFocus);};
  },[]);

  useEffect(()=>{
    if(!documentProxy||!canvasRef.current)return;
    let active=true;
    let renderTask:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
    documentProxy.getPage(pageNumber).then(pdfPage=>{
      if(!active)return;
      const viewport=pdfPage.getViewport({scale:1.25});
      const canvas=canvasRef.current;
      if(!canvas)return;
      const context=canvas.getContext('2d');
      if(!context)return;
      canvas.width=viewport.width;
      canvas.height=viewport.height;
      renderTask=pdfPage.render({canvas,canvasContext:context,viewport});
      return renderTask.promise;
    }).catch(renderError=>{
      if(active&&renderError instanceof Error&&renderError.name!=='RenderingCancelledException')setError(renderError.message);
    });
    return()=>{active=false;renderTask?.cancel();};
  },[documentProxy,pageNumber]);

  useEffect(()=>{
    if(!documentProxy||!focused||readPages.includes(pageNumber-1))return;
    const timer=window.setTimeout(()=>{
      onReadPages(material.id,documentProxy.numPages,[...readPages,pageNumber-1]);
    },2000);
    return()=>window.clearTimeout(timer);
  },[documentProxy,focused,material.id,onReadPages,pageNumber,readPages]);

  const coverage=reading?.pageCount?Math.min(100,Math.floor(readPages.length/reading.pageCount*100)):0;
  return <section className="bible-reader" aria-label={material.title}>
    <div className="bible-reader-heading"><strong>{translateText("📖 ")}{material.title}</strong><small>{coverage}{translateText("% read · 95% required")}</small></div>
    {error&&<p className="lesson-video-missing" role="alert">{error}</p>}
    {!documentProxy&&!error&&<p className="mgr-muted">{translateText("Loading Bible book…")}</p>}
    {documentProxy&&<>
      <div className="bible-page-controls">
        <button type="button" className="btn-outline" disabled={pageNumber<=1} onClick={()=>setPageNumber(value=>value-1)}>{translateText("Previous page")}</button>
        <span>{translateText("Page ")}{pageNumber}{translateText(" of ")}{documentProxy.numPages}</span>
        <button type="button" className="btn-outline" disabled={pageNumber>=documentProxy.numPages} onClick={()=>setPageNumber(value=>value+1)}>{translateText("Next page")}</button>
      </div>
      <div className="bible-page-canvas"><canvas ref={canvasRef} /></div>
    </>}
  </section>;
}

function youtubeVideoId(value?:string){if(!value)return null;try{const url=new URL(value);if(url.hostname==='youtu.be'||url.hostname.endsWith('.youtu.be'))return url.pathname.split('/').filter(Boolean)[0]??null;if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(url.hostname)){if(url.pathname==='/watch')return url.searchParams.get('v');if(/^\/(embed|shorts)\//.test(url.pathname))return url.pathname.split('/')[2]??null;}return null;}catch{return null;}}
function MaterialUpload({courseId,lessonCount,onSaved}:{courseId:string;lessonCount:number;onSaved:()=>void}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [materialType,setMaterialType]=useState('VIDEO');const [lessonNumber,setLessonNumber]=useState('1');
  const submit=async(form:HTMLFormElement)=>{const data=new FormData(form);const file=data.get('file');const url=String(data.get('onlineUrl')||'').trim();const title=String(data.get('title')||'').trim();if(!(file instanceof File&&file.size>0)&&!url){setError('Choose a file or enter a resource URL.');return;}if(file instanceof File&&file.size>100*1024*1024){setError('Files must be 100 MB or smaller.');return;}if(materialType==='VIDEO'&&!lessonNumber){setError('Choose the lesson this video belongs to.');return;}if(lessonNumber&&(Number(lessonNumber)<1||Number(lessonNumber)>lessonCount)){setError('Choose a valid lesson.');return;}if(url){try{new URL(url);}catch{setError('Enter a valid resource URL.');return;}const platform=String(data.get('onlinePlatform')||'Online class');if(!title)data.set('title',`${platform} class`);}if(title.length>160){setError('Use 160 characters or fewer for the title.');return;}if(lessonNumber)data.set('lessonNumber',lessonNumber);else data.delete('lessonNumber');data.delete('onlinePlatform');try{setBusy(true);setError('');await api.post(`/instructor/courses/${courseId}/materials`,data,{headers:{'Content-Type':'multipart/form-data'}});form.reset();setMaterialType('VIDEO');setLessonNumber('1');onSaved();}catch(e){setError(messageFromError(e));}finally{setBusy(false);}};
  return <form className="upload-form" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget);}}><label className="field"><span>{translateText("Add material (manager review required)")}</span><input name="file" type="file" accept="video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,image/*" /></label><label className="field"><span>{translateText("Online class platform")}</span><select name="onlinePlatform"><option value="Zoom">{translateText("Zoom")}</option><option value="Google Classroom">{translateText("Google Classroom")}</option><option value="Other">{translateText("Other")}</option></select></label><label className="field"><span>{translateText("Online class/resource URL")}</span><input name="onlineUrl" type="url" placeholder={translateText("https://")} /></label><label className="field"><span>{translateText("Material type")}</span><select name="type" value={materialType} onChange={event=>setMaterialType(event.target.value)}><option value="VIDEO">{translateText("Video lesson")}</option><option value="PDF_BOOK">{translateText("PDF book")}</option><option value="DOCUMENT">{translateText("Document")}</option><option value="IMAGE">{translateText("Image")}</option><option value="AUDIO">{translateText("Audio")}</option><option value="PRESENTATION">{translateText("Presentation")}</option><option value="ASSIGNMENT">{translateText("Assignment")}</option><option value="QUIZ">{translateText("Quiz")}</option><option value="OTHER">{translateText("Other")}</option></select></label><label className="field"><span>{translateText("Lesson ")}{materialType==='VIDEO'?translateText("*"):translateText("(optional)")}</span><select required={materialType==='VIDEO'} value={lessonNumber} onChange={event=>setLessonNumber(event.target.value)}><option value="">{translateText("Course-level material")}</option>{Array.from({length:lessonCount},(_,index)=><option key={index+1} value={index+1}>{translateText("Lesson ")}{index+1}</option>)}</select></label><label className="field"><span>{translateText("Title")}</span><input name="title" /></label><button className="btn-outline" disabled={busy}>{busy?translateText("Uploading…"):translateText("Submit material")}</button>{error&&<small className="field-error">{error}</small>}</form>;
}
