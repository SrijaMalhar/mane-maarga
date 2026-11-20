import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './style.css'

class AppErrorBoundary extends React.Component<{children:React.ReactNode},{hasError:boolean}> {
  constructor(props:{children:React.ReactNode}) { super(props); this.state={hasError:false} }
  static getDerivedStateFromError() { return {hasError:true} }
  componentDidCatch(error:Error,info:React.ErrorInfo) { console.error('Sooru UI error',error,info.componentStack) }
  render() {
    if(this.state.hasError) return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,fontFamily:'system-ui'}}><section style={{maxWidth:520,textAlign:'center'}}><h1>Something went wrong</h1><p>The workspace could not render this screen. Reload the app or check the browser console.</p><button onClick={()=>window.location.reload()}>Reload workspace</button></section></main>
    return this.props.children
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>)
