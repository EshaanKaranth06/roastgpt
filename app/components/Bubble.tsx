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