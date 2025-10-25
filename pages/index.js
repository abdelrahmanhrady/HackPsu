import { styled } from 'styled-components'

const Navbar = styled.nav`
  position: fixed;
  top: 0;
  width: 100%;
  height: 70px;
  background-color: #001f3f;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  z-index: 10;
`

const Body = styled.div`
  margin-top: 80px;
  height: 200vh; /* makes it scrollable */
  background: #f4f6f8;
  padding: 20px;
  font-size: 1.2rem;
`

export default function Home() {
  return (
    <>
      <Navbar>Learn Live</Navbar>
      <Body>
        Scrollable body content here...
      </Body>
    </>
  )
}
