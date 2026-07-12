const Button = ({ label, onClick = () => { }, styles = {}, type = 'basic' }) => (
    <button
        onClick={onClick}
        className={`ui-btn ui-btn--${type === 'primary' ? 'primary' : 'basic'}`}
        style={styles}
    >
        {label}
    </button>
)

export default Button
