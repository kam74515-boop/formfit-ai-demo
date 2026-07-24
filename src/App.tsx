import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import LiveWorkout from './pages/LiveWorkout'
import VideoAnalysis from './pages/VideoAnalysis'
import Onboarding from './pages/Onboarding'
import Plan from './pages/Plan'
import Health from './pages/Health'
import TrainHub from './pages/TrainHub'
import Me from './pages/Me'
import WorkoutSession from './pages/WorkoutSession'
import ExerciseDetail from './pages/ExerciseDetail'
import Coach from './pages/Coach'
import TabBar from './components/TabBar'
import PhoneStatusBar from './components/PhoneStatusBar'

function Shell() {
  const { pathname } = useLocation()
  const immersive =
    pathname.startsWith('/live') ||
    pathname.startsWith('/workout') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/coach')

  return (
    <>
      <div key={pathname} className="animate-fade-in">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/train" element={<TrainHub />} />
          <Route path="/health" element={<Health />} />
          <Route path="/me" element={<Me />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/live/:exerciseId?" element={<LiveWorkout />} />
          <Route path="/workout" element={<WorkoutSession />} />
          <Route path="/video" element={<VideoAnalysis />} />
          <Route path="/exercise/:id" element={<ExerciseDetail />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!immersive && <TabBar />}
      <PhoneStatusBar />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
