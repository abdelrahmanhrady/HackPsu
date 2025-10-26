import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import styled, { keyframes, createGlobalStyle, css } from 'styled-components'
import LearnLiveLogo from '../public/LearnLiveLogo.png'
import { FaMicrophone, FaRobot, FaFileAlt, FaArrowLeft, FaUserCircle } from 'react-icons/fa'
import { useRouter } from 'next/router'

// Global Styles
const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap');
  * {
    font-family: 'Montserrat', sans-serif;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  html, body {
    overflow-x: hidden;
  }
  body {
    font-family: 'Montserrat', sans-serif;
  }
`

// Navbar
const Navbar = styled.nav`
  position: fixed;
  top: 0;
  width: 100%;
  height: 80px;
  background-color: #001f3f;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 35px;
  font-size: 1.6rem;
  font-weight: bold;
  z-index: 10;
`

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const NavLinks = styled.ul`
  list-style: none;
  display: flex;
  gap: 40px;
  justify-content: center;
  flex: 1;
`

const NavLink = styled.a`
  color: white;
  text-decoration: none;
  position: relative;
  font-size: 1.2rem;

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -4px;
    width: 0%;
    height: 2px;
    background: linear-gradient(to right, #05AAdb, #0A7FD5);
    transition: all 0.3s ease;
    transform: translateX(-50%);
  }

  &:hover::after {
    width: 100%;
  }
`

const SignInButton = styled.button`
  background: #05AADB;
  color: white;
  border: none;
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.3s ease;
  align-self: center;

  &:hover {
    background: #0A7FD5;
  }
`

// Body & Sections
const Body = styled.div`
  margin-top: 80px;
  font-size: 1.2rem;
  position: relative;
`

const FirstSection = styled.section`
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  position: relative;
  background: linear-gradient(to right, #70c1f5, #a6e0ff, #70c1f5);
  padding: 20px;
  overflow: hidden;
`

const Box = styled.div`
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 700px;
  margin-top: 100px;
`

const gradientAnim = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`

const BoxTitle = styled.div`
  font-weight: bold;
  font-size: 3rem;
  background: linear-gradient(270deg, #062a4fff, #325a95ff, #0c3460ff);
  background-size: 200% auto;
  animation: ${gradientAnim} 5s ease infinite;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`

const BoxSubtitle = styled.div`
  font-weight: normal;
  font-size: 1.5rem;
  background: linear-gradient(270deg, #041A32, #325a95ff, #041A32);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: center;
  line-height: 2rem;
`

const GetStartedButton = styled.button`
  margin-top: 40px;
  font-size: 1.5rem;
  font-weight: bold;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  color: white;
  background: linear-gradient(270deg, #062a4fff, #325a95ff, #0c3460ff);
  background-size: 200% 100%;
  background-position: 0% 50%;
  transition: background-position 1s ease, transform 0.3s ease;
  max-width: 220px;
  width: 100%;
  text-align: center;
  padding: 14px 0;

  &:hover {
    background-position: 100% 50%;
  }
`

const ButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: -10px;
`

// Waveform
const Waveform = styled.div`
  display: grid;
  grid-template-columns: repeat(60, 1fr);
  align-items: end;
  width: 100%;
  height: 200px;
  position: absolute;
  bottom: 0;
  left: 0;
  margin: 0;
  padding: 0;
  z-index: 1;
  pointer-events: none;
`

const Bar = styled.div`
  width: 100%;
  background-color: rgba(10, 127, 213, 0.7);
  height: ${({ height }) => height}px;
  margin: 0;
  border-radius: 0;
  transition: height 2s linear;
`

const Line = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 10px;
  background-color: rgba(10, 127, 213, 0.7);
  transform: translateY(50%);
  z-index: 1;
`

// Icon Animations
const appearPopOnce = keyframes`
  0% { transform: scale(0); opacity: 0; }
  6.66% { transform: scale(1); opacity: 1; }
  26.66% { transform: scale(1); opacity: 1; }
  33.33% { transform: scale(0); opacity: 0; }
  100% { transform: scale(0); opacity: 0; }
`

const fadeSlideOutOnce = keyframes`
  0% { opacity: 0; transform: translateX(50px); }
  6.66% { opacity: 1; transform: translateX(0); }
  26.66% { opacity: 1; transform: translateX(0); }
  30% { opacity: 0; transform: translateX(50px); }
  100% { opacity: 0; transform: translateX(50px); }
`

const arrowPop = keyframes`
  0% { transform: translateX(50px) scale(0); opacity: 0; }
  3.33% { transform: translateX(0) scale(1); opacity: 1; }
  26.66% { transform: translateX(0) scale(1); opacity: 1; }
  30% { transform: translateX(50px) scale(0); opacity: 0; }
  100% { transform: translateX(50px) scale(0); opacity: 0; }
`

// Smooth pulse for circle
const pulseCircleOnce = keyframes`
  0% { transform: scale(0); opacity: 0; }
  10% { transform: scale(1.5); opacity: 0.5; }
  23.33% { transform: scale(1.5); opacity: 0; }
  33.33% { transform: scale(0); opacity: 0; }
  100% { transform: scale(0); opacity: 0; }
`

const IconRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 60px;
  position: relative;
`

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 20px;
  ${({ delay }) => css`
    animation: ${appearPopOnce} 15s ${delay}s linear infinite;
  `}
  transform-origin: center;
  transform: scale(0);
  position: relative;
`

const Circle = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  border: 2px solid #041A32;
  border-radius: 50%;
  ${({ delay }) => css`
    animation: ${pulseCircleOnce} 15s ${delay - 0.5}s linear infinite;
  `}
  transform: scale(0);
`

const AnimatedText = styled.div`
  font-family: 'Montserrat', sans-serif;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: right;
  margin-right: 20px;
  opacity: 0;
  ${({ delay }) => css`
    animation: ${fadeSlideOutOnce} 15s ${delay}s linear infinite;
  `}
`

const Arrow = styled(FaArrowLeft)`
  margin-left: 15px;
  color: #041A32;
  font-size: 2rem;
  opacity: 0;
  ${({ delay }) => css`
    animation: ${arrowPop} 15s ${delay-0.5}s linear infinite;
  `}
`

// Sections
const Section = styled.section`
  padding: 80px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
`

const SectionTitle = styled.h2`
  font-size: 3rem;
  font-weight: bold;
  margin-bottom: 40px;
  color: #041A32;
`

const AboutContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 40px;
  flex-wrap: wrap;
  margin-top: 20px;
`

const AboutCard = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 15px;
  width: 200px;
  height: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;

  svg {
    font-size: 3rem;
    margin-top: 5px;
    margin-bottom: 5px;
    color: #041A32;
  }

  strong {
    font-size: 1.2rem;
    margin-bottom: 10px;
  }

  p {
    font-size: 1rem;
    margin-top: 20px;
    flex-grow: 1;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start; /* align text to left */
    width: 100%; /* make full width for left alignment */
    text-align: left;
    color: #868686ff;
  }
`
const PricingSection = styled(Section)`
  background-color: #f0f8ff;
`

const PricingContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 30px;
  flex-wrap: wrap;
  margin-top: 20px;
`

const PricingCard = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.15);
  width: 250px;
  padding: 30px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  height: 450px;

  &:nth-child(1) { border: 2px solid #05AADB; }
  &:nth-child(2) { border: 2px solid #0A7FD5; }
  &:nth-child(3) { border: 2px solid #041A32; }

  h3 { font-size: 1.5rem; margin-bottom: 5px; }
  .price { font-size: 2.5rem; font-weight: bold; margin: 10px 0; }
  .per-user { font-size: 0.9rem; color: gray; margin-bottom: 20px; }

  ul {
    list-style: none;
    padding: 0;
    text-align: left;
    width: 100%;
    flex-grow: 1;

    li {
      margin-bottom: 8px;
      &:before {
        content: '✔';
        margin-right: 8px;
        color: green;
      }
    }
  }

  button {
    background-color: #05AADB;
    color: white;
    border: none;
    padding: 10px 35px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    margin-top: auto;
    transition: background 0.3s ease;

    &:hover {
      background-color: #0A7FD5;
    }
  }
`

const DevsSection = styled(Section)`
  background-color: #e0f0ff;
`

const DevsCards = styled.div`
  display: flex;
  gap: 30px;
  flex-wrap: wrap;
  justify-content: center;
`
const DevCard = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 15px;
  width: 200px;
  height: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;

  svg {
    font-size: 3rem;
    margin-top: 5px;
    margin-bottom: 5px;
    color: #041A32;
  }

  strong {
    font-size: 1.2rem;
    margin-bottom: 10px;
  }

  p {
    font-size: 1rem;
    margin-top: 20px;
    flex-grow: 1;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start; /* align text to left */
    width: 100%; /* make full width for left alignment */
    text-align: left;
    color: #868686ff;
  }
`

const Footer = styled.footer`
  padding: 40px 20px;
  text-align: center;
  background-color: #001f3f;
  color: white;
  font-size: 1rem;
`

export default function Home() {
  const router = useRouter()

  const [bars, setBars] = useState(Array(60).fill(40))

  useEffect(() => {
    const interval = setInterval(() => {
      setBars(prev =>
        prev.map(() =>
          Math.random() < 0.5
            ? Math.floor(Math.random() * 91) + 10
            : Math.floor(Math.random() * 51) + 200
        )
      )
    }, 300)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <>
      <GlobalStyle />
      <Navbar>
        <LogoContainer>
          <Image src={LearnLiveLogo} alt="Learn Live Logo" width={50} height={50} />
        </LogoContainer>
        <NavLinks>
          <li><NavLink href="#about">About</NavLink></li>
          <li><NavLink href="#pricing">Pricing</NavLink></li>
          <li><NavLink href="#devs">Devs</NavLink></li>
        </NavLinks>
      <SignInButton onClick={() => router.push('/LogIn')}>Sign In</SignInButton>
      </Navbar>

      <Body>
        <FirstSection>
          <Box>
            <BoxTitle>Make Homework Alive Again</BoxTitle>
            <BoxSubtitle>
              Solve Assignments along with AI through Voice chatting.<br />
              More Studying, Less Cheating, Improved Education.
            </BoxSubtitle>
            <ButtonWrapper>
              <GetStartedButton onClick={() => router.push('/SignUp')}>Get Started</GetStartedButton>
            </ButtonWrapper>
          </Box>

          <Waveform>
            {bars.map((height, i) => (
              <Bar key={i} height={height} />
            ))}
          </Waveform>

          <Line />

          <div style={{ position: 'absolute', top: '18%', right: '0%' }}>
            <IconRow>
              <AnimatedText delay={0}>Voice Chat</AnimatedText>
              <IconWrapper delay={0}>
                <Circle delay={0} />
                <FaMicrophone size={40} color="#041A32" />
              </IconWrapper>
              <Arrow delay={0} />
            </IconRow>

            <IconRow>
              <AnimatedText delay={5}>Cheating Free</AnimatedText>
              <IconWrapper delay={5}>
                <Circle delay={5} />
                <FaRobot size={40} color="#041A32" />
              </IconWrapper>
              <Arrow delay={5} />
            </IconRow>

            <IconRow>
              <AnimatedText delay={10}>AI Assessing</AnimatedText>
              <IconWrapper delay={10}>
                <Circle delay={10} />
                <FaFileAlt size={40} color="#041A32" />
              </IconWrapper>
              <Arrow delay={10} />
            </IconRow>
          </div>
        </FirstSection>

        <Section id="about">
          <SectionTitle>About</SectionTitle>
          <AboutContainer>
            <AboutCard>
              <FaMicrophone />
              <strong>Voice Chat</strong>
              <p>All assignments are done through Voice Chat interactions only to mimick in-person learning.</p>
            </AboutCard>
            <AboutCard>
              <FaRobot />
              <strong>Cheating Free</strong>
              <p>No visual elements to take pictures or copy-paste from. All interactions are through Voice only.</p>
            </AboutCard>
            <AboutCard>
              <FaFileAlt />
              <strong>AI Assessing</strong>
              <p>AI assesses student answers and gives a summarized version with a suggested a grade.</p>
            </AboutCard>
          </AboutContainer>
        </Section>

        <PricingSection id="pricing">
          <SectionTitle>Pricing</SectionTitle>
          <PricingContainer>
            <PricingCard>
              <h3>Unlimited</h3>
              <p className="price">$0.00</p>
              <p className="per-user">Best for small teams</p>
              <ul>
                <li>Unlimited Storage</li>
                <li>Unlimited Folders and Spaces</li>
                <li>Unlimited Integrations</li>
                <li>Unlimited AI Assessing</li>
              </ul>
              <button>FREE</button>
            </PricingCard>
            <PricingCard>
              <h3>Business</h3>
              <p className="price">$0.00</p>
              <p className="per-user">Best for mid-sized teams</p>
              <ul>
                <li>Everything in Unlimited, plus:</li>
                <li>Unlimited Message History</li>
                <li>Unlimited Dashboards</li>
              </ul>
              <button>FREE</button>
            </PricingCard>
            <PricingCard>
              <h3>Enterprise</h3>
              <p className="price">$0.00</p>
              <p className="per-user">Best for mid-sized teams</p>
              <ul>
                <li>Everything in Business, plus:</li>
                <li>White Labeling</li>
                <li>Unlimited Assignments</li>
              </ul>
              <button>FREE</button>
            </PricingCard>
          </PricingContainer>
        </PricingSection>

        <DevsSection id="devs">
          <SectionTitle>Devs</SectionTitle>
          <DevsCards>
            <DevCard>
              <FaUserCircle />
              <strong>Abdel Rady</strong>
              <p>Working in Frontend. Developing UI/UX and responsible for Graphic Design and minimal Backend effort.</p>
            </DevCard>
            <DevCard>
              <FaUserCircle />
              <strong>Bill Erd</strong>
              <p>Working in Backend. Developing Authentication, Cloud Databases, AI APIs, and Dashboard functionality.</p>
            </DevCard>
          </DevsCards>
        </DevsSection>

        <Footer>© 2025 LearnLive. All rights reserved.</Footer>
      </Body>
    </>
  )
}
