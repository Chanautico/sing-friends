import { Routes, Route } from 'react-router-dom'
import Home from './components/Home.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import Room from './components/Room.jsx'
import AddSong from './components/AddSong.jsx'
import KaraokePlayer from './components/KaraokePlayer.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/room/:code" element={<Room />} />
      <Route path="/room/:code/add" element={<AddSong />} />
      <Route path="/room/:code/stage" element={<KaraokePlayer />} />
    </Routes>
  )
}
