// StarIcon.tsx
import React from "react";

interface StarIconProps {
    size?: number;
    color?: string;
    className?: string;
}

const StarIcon: React.FC<StarIconProps> = ({
                                               size = 16,
                                               color = "#FAC917",
                                               className = ""
                                           }) => {
    return (
        <svg
            version="1.1"
            id="Layer_1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 426.667 426.667"
            width={size}
            height={size}
            fill={color}
            className={className}
        >
            <polygon points="213.333,10.441 279.249,144.017 426.667,165.436 320,269.41 345.173,416.226 213.333,346.91 81.485,416.226 106.667,269.41 0,165.436 147.409,144.017"/>
        </svg>
    );
};

export default StarIcon;