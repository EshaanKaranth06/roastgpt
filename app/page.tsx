"use client"

import Image from "next/image"
import logo from "./assets/logo.png"
import Bubble from "./components/Bubble"
import LoadingBubble from "./components/LoadingBubble"
import PromptSuggestionRow from "./components/PromptSuggestionRow"
import { useEffect, useRef, useState } from "react"

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: Date
}

const MAX_INPUT_LENGTH = 1000
const REQUEST_TIMEOUT = 30000

const Home = () => {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messageEndRef = useRef<HTMLDivElement>(null) //for autoscrolling msgs

    const scrollBottom = () => {
        messageEndRef.current?.scrollIntoView({behavior: "smooth"})
    }

    useEffect(() => {
        scrollBottom()
    },[messages])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        if(value.length <= MAX_INPUT_LENGTH){
            setInput(value)
        }
    }

    const createMessage = (role: 'user' | 'assistant', content: string): Message => ({
        id: Date.now().toString(),
        role,
        content,
        createdAt: new Date()
    })

    const handleSubmit = async (e: React.FormEvent) =>{
        e.preventDefault()
        console.log('Submitting input:',input)

        const trimmedInput = input.trim()
        if(!trimmedInput || isLoading || trimmedInput.length > MAX_INPUT_LENGTH){
            return
        }

        setIsLoading(true)
        const userMessage = createMessage('user', trimmedInput)
        
        setMessages(prev => [...prev, userMessage])
        setInput('')

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

        try{
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers:{
                    'Content-type':'application/json'
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage]
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if(!response.ok){
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            if(!response.body){
                throw new Error('No response body received')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            try{
                while(true){
                    const {done, value} = await reader.read()

                    if(done){
                        break
                    }

                    buffer += decoder.decode(value, {stream: true})
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for( const line of lines){
                        if(line.startsWith('data: ')){
                            const data = line.slice(6)
                            if(data === '[DONE]') continue

                            try{
                                const parsed: Message = JSON.parse(data)
                                setMessages(prev => {
                                    const lastMessage = prev[prev.length - 1]
                                    if(lastMessage?.role === 'assistant'){
                                        return [
                                            ...prev.slice(0, -1),
                                            {
                                                ...lastMessage,
                                                content: parsed.content
                                            }
                                        ]
                                    }
                                    return [...prev, parsed]
                                })
                            } catch (parseError){
                                console.error('Error parsing streaming message:',parseError)
                            }
                        }
                    }
                } 
            }catch(streamError){
                if (streamError instanceof Error && streamError.name === 'AbortError'){
                    console.log('Stream reading aborted')
                    throw new Error('Rquest timed out')
                }
                throw streamError
            } finally {
                reader.releaseLock()
            }
        } catch (error){
            console.error('Chat Error:',error)
            setMessages(prev => [
                ...prev,
                createMessage('assistant',
                    error instanceof Error && error.message === 'Request timed out'
                    ? 'Sorry, the request timed out. Please try again.'
                    : 'Sorry, there was an error processing your request. Please try again.'
                )
            ])
        } finally {
            setIsLoading(false)
        }
    }

    const handlePrompt = async (promptText: string) => {
        if(!promptText?.trim() || isLoading){
            return
        }
        setInput(promptText)
        const submitEvent = {
            preventDefault: () => {},
        } as React.FormEvent<HTMLFormElement>
        await handleSubmit(submitEvent)
    }

    const noMessages = messages.length === 0

    return (
        <main>
            <div className="chat-header">
                <Image src={logo} width={130} alt="rgpt logo" priority/>
            </div>

            <section className={`chat-messages ${noMessages ? "" : "populated"}`}>
                {noMessages ? (
                    <div className="welcome-container">
                        <p className="starter-text">
                            Ayy Wassup yo? Wanna Insult yourself today? Feel free to Shoot your messages!
                        </p>
                        <PromptSuggestionRow onPromptClick={handlePrompt} />
                    </div>
                ) : (
                    <div className="messages-container">
                        {messages.map((message: Message, index: number) => (
                            <div key={`message-wrapper ${message.role}`}>
                            <Bubble key={`bubble-${message.id}`}
                            message={message} />
                            {index === messages.length -1 && isLoading && <LoadingBubble />}
                            </div>
                        ))}
                        <div ref = {messageEndRef} />
                    </div>
                )}
            </section>
            <form className="chat-input-form" onSubmit={handleSubmit}>
                <input className="question-box" onChange={handleInputChange}  
                value={input} placeholder="Type something..."
                disabled={isLoading}
                maxLength={MAX_INPUT_LENGTH}
                type="text"
                onKeyPress={(e) => {
                    if(e.key === 'Enter' && !e.shiftKey){
                        e.preventDefault()
                        handleSubmit(e as unknown as React.FormEvent)
                    }
                }}  
                />
                <button type="submit" className={`submit-button ${isLoading || !input.trim() ?  'disabled' : ''}`}
                disabled={isLoading || !input.trim()}
                >Send</button>
            </form> 
        </main>
    )
}

export default Home