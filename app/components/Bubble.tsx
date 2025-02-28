import { useEffect, useState } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: Date
}

interface BubbleProps {
    message: Message
}

const formatTime = (date: Date): string => {
    try{
        return new Intl.DateTimeFormat('en-US',{
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).format(new Date(date))
    } catch(error){
        console.error('Date formatting error:',error)
        return ''
    }
}

const Bubble: React.FC<BubbleProps> = ({ message }) => {
    const [formattedContent, setFormattedContent] = useState(message.content)

    useEffect(() => {
        setFormattedContent(message.content)
    }, [message.content])

    return (
        <div className = {`bubble ${message.role}`}>
            <div className = "bubble-header">
                <span className="bubble-avatar">
                    {message.role === 'assistant' ? '😈':'👤'}
                </span>
                <span className="bubble-name">
                    {message.role === 'assistant' ? 'RoasterOP':'You'}
                </span>
            </div>
            <div className="bubble-content">
                {formattedContent}
            </div>
        </div>
    )
}

export default Bubble