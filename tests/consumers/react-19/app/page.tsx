import { CodeIcon } from '@drasi/react/components';
import { ReactContractApp } from '../.generated/react-app';

export default function Page() {
  return <>
    <h1>App Router server page</h1>
    <p data-testid="server-rendered">Server-rendered route with a package client boundary.</p>
    <ReactContractApp />
    <span aria-label="Package client export"><CodeIcon /></span>
  </>;
}
