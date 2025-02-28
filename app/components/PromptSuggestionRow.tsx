interface PromptSuggestionRowProps {
    onPromptClick: (prompt: string) => void
}

const PromptSuggestionRow: React.FC<PromptSuggestionRowProps> = ({ onPromptClick }) => {
    const suggestions = [
        "Roast me",
        "Roast my friend",
        "Tell me a joke"
    ]

    return (
        <div className="prompt-suggestion-row">
            {suggestions.map((suggestion, index) => (
                <button key={index} className="prompt-suggestion-button"
                onClick={() => onPromptClick(suggestion)}
                >
                {suggestion}
                </button>
            ))}
        </div>
    )
}

export default PromptSuggestionRow